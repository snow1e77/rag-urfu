import os
import shutil
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from openai import OpenAI

import rag_engine

load_dotenv()

app = FastAPI(title="RAG System API")

# Раздаем статику
app.mount("/static", StaticFiles(directory="static"), name="static")

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

if not OPENROUTER_API_KEY or OPENROUTER_API_KEY == "your_key_here":
    print("ВНИМАНИЕ: OPENROUTER_API_KEY не установлен в .env")

# Инициализация клиента OpenAI для работы с OpenRouter
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY or "DUMMY_KEY",
)

class AskRequest(BaseModel):
    question: str
    chat_id: str

@app.get("/")
async def root():
    return FileResponse("static/index.html")

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...), chat_id: str = Form(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Разрешены только PDF файлы")
        
    # Создаем папку для временных файлов, если ее нет
    os.makedirs("temp", exist_ok=True)
    temp_file_path = os.path.join("temp", file.filename)
    
    try:
        # Сохраняем загруженный файл
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Запускаем обработку текста и сохранение в векторную базу
        num_chunks = rag_engine.process_and_store_document(temp_file_path, chat_id, file.filename)
        
        return {"message": f"Файл {file.filename} загружен и готов к ответам (кусков: {num_chunks}).", "file_name": file.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка при обработке файла: {str(e)}")
    finally:
        # Обязательно удаляем временный файл
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@app.post("/ask")
async def ask_question(request: AskRequest):
    question = request.question
    chat_id = request.chat_id
    
    if not question.strip():
        raise HTTPException(status_code=400, detail="Вопрос не может быть пустым")
        
    # Ищем наиболее релевантные куски в ChromaDB ИМЕННО ДЛЯ ЭТОГО ЧАТА
    context_chunks = rag_engine.query_relevant_chunks(question, chat_id, top_k=3)
    
    if not context_chunks:
        return {"answer": "В прикрепленных документах нет подходящего ответа, либо документы не добавлены.", "context_used": []}
        
    # Объединяем найденные куски в один текст для промпта
    context = "\n---\n".join(context_chunks)
    
    # Формируем итоговый промпт
    prompt = f"Используя этот контекст: {context}\n\nОтветь на вопрос: {question}"
    
    try:
        # Отправляем запрос к LLM (в данном случае nvidia/nemotron-3-super-120b-a12b:free)
        response = client.chat.completions.create(
            model="nvidia/nemotron-3-super-120b-a12b:free",
            messages=[
                {"role": "user", "content": prompt}
            ],
            extra_headers={
                "HTTP-Referer": "https://github.com/rag-urfu", # Заголовок для OpenRouter, как запросили
                "X-OpenRouter-Title": "Falal RAG Assistant",
            }
        )
        
        answer = response.choices[0].message.content
        
        return {
            "answer": answer,
            "context_used": context_chunks
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка при обращении к LLM: {str(e)}")

@app.delete("/files/{chat_id}/{filename}")
async def delete_file(chat_id: str, filename: str):
    try:
        rag_engine.delete_file_from_chat(chat_id, filename)
        return {"message": "Файл успешно удален из контекста."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка удаления файла: {str(e)}")
