FROM python:3.11-alpine

ENV MUSL_LOCPATH="/usr/share/i18n/locales/musl"
RUN apk --no-cache add musl-locales musl-locales-lang

WORKDIR /app/
COPY requirements.txt ./
RUN pip install -r requirements.txt
RUN pip install gunicorn
COPY . ./

USER guest
CMD ["gunicorn", "scheduler.app:app", "--bind", "0.0.0.0:8080"]
EXPOSE 8080
