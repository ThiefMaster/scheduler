FROM python:3.11-alpine

WORKDIR /app/
COPY requirements.txt ./
RUN pip install -r requirements.txt
RUN pip install gunicorn
COPY . ./

USER guest
CMD ["gunicorn", "scheduler.app:app", "--bind", "0.0.0.0:8080"]
EXPOSE 8080
