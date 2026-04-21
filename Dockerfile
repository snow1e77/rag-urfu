# Используем легковесный образ Python
FROM python:3.10-slim

# Устанавливаем рабочую директорию
WORKDIR /app

# Создаем пользователя без прав root (Требование безопасности Hugging Face Spaces)
RUN useradd -m -u 1000 user

# Копируем локальные файлы зависимостей
COPY requirements.txt .

# Устанавливаем зависимости системы (могут понадобиться для некоторых питоновских библиотек)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Устанавливаем библиотеки Python
RUN pip install --no-cache-dir -r requirements.txt

# Копируем все файлы проекта в контейнер
COPY --chown=user:user . .

# Переключаемся на пользователя user
USER user

# Создаем папку для сохранения временных файлов (чтобы не было ошибок доступа)
RUN mkdir -p /app/temp && mkdir -p /app/chroma_db

# Порт 7860 - стандартный порт для Hugging Face Spaces
EXPOSE 7860

# Запускаем Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
