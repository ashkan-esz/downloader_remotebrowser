build-image:
	docker image build -t express-puppeteer-docker --network=host .

run-image:
	docker run -p 5000:5000 --env-file ./.env express-puppeteer-docker

up-dev:
	docker-compose up --build

up-prod:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml up --build

down:
	docker-compose down