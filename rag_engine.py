import os
import uuid
import pdfplumber
import chromadb
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

load_dotenv()

CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "600"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "100"))

# Инициализация Chromadb локально. Используем v2 для чистого старта после смены архитектуры.
chroma_client = chromadb.PersistentClient(path="./chroma_db")
collection = chroma_client.get_or_create_collection(name="rag_collection_v2")

# Инициализация локальной модели эмбеддингов
print("Загрузка модели SentenceTransformer...")
embedder = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
print("Модель загружена.")

def extract_text_from_pdf(file_path: str) -> str:
    """Извлекает текст из PDF файла с использованием pdfplumber."""
    text = ""
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    return text

def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Разбивает текст на куски (чанки) с учетом нахлеста."""
    if not text:
        return []
    
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        chunks.append(chunk)
        start += chunk_size - overlap # Сдвиг с учетом нахлеста
        
    return chunks

def process_and_store_document(file_path: str, chat_id: str, file_name: str):
    """Извлекает текст, разбивает его и сохраняет в ChromaDB с привязкой к chat_id."""
    text = extract_text_from_pdf(file_path)
    chunks = chunk_text(text)
    
    if not chunks:
        return 0
        
    # Формируем эмбеддинги для всех чанков
    embeddings = embedder.encode(chunks).tolist()
    
    # Генерируем уникальные ID и метаданные
    ids = [str(uuid.uuid4()) for _ in chunks]
    metadatas = [{"chat_id": chat_id, "file_name": file_name} for _ in chunks]
    
    # Добавляем в коллекцию
    collection.add(
        documents=chunks,
        embeddings=embeddings,
        ids=ids,
        metadatas=metadatas
    )
    
    return len(chunks)

def query_relevant_chunks(question: str, chat_id: str, top_k: int = 3) -> list[str]:
    """Ищет наиболее подходящие фрагменты текста по вопросу в рамках текущего чата."""
    query_embedding = embedder.encode([question]).tolist()
    
    # Пытаемся найти результаты с учетом chat_id
    try:
        results = collection.query(
            query_embeddings=query_embedding,
            n_results=top_k,
            where={"chat_id": chat_id}
        )
        
        if not results or not results['documents'] or len(results['documents'][0]) == 0:
            return []
            
        return results['documents'][0]
    except Exception as e:
        print(f"Ошибка поиска в chroma: {e}")
        return []

def delete_file_from_chat(chat_id: str, file_name: str):
    """Удаляет все эмбеддинги конкретного файла в текущем чате."""
    try:
        collection.delete(
            where={
                "$and": [
                    {"chat_id": chat_id},
                    {"file_name": file_name}
                ]
            }
        )
    except Exception as e:
        print(f"Ошибка удаления из chroma: {e}")
