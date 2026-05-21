FROM python:3.10-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
    && install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl \
    && rm kubectl \
    && rm -rf /var/lib/apt/lists/*


COPY requirements.txt .

RUN pip install --only-binary :all: --upgrade pip \
    && pip install --only-binary :all: --no-cache-dir -r requirements.txt


COPY . .

RUN addgroup --system kubi \
    && adduser --system --ingroup kubi kubi \
    && chown -R kubi:kubi /app

USER kubi

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]