FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --only-binary :all: --upgrade pip \
    && pip install --only-binary :all: --no-cache-dir -r requirements.txt

COPY . .

# Expose port
EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
