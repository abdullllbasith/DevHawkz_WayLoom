FROM python:3.12.6-slim-bookworm

WORKDIR /work/services/planning

COPY services/planning/pyproject.toml ./
COPY services/planning/app ./app

# pylock.toml locks CPython 3.12 Windows wheels. This Linux image installs the same direct pins from pyproject.toml.
RUN pip install --upgrade pip==26.2.1 \
  && pip install --no-cache-dir . \
  && useradd --create-home --uid 10001 wayloom \
  && chown -R wayloom:wayloom /work

USER wayloom
ENV PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000

CMD ["python", "-m", "app"]
