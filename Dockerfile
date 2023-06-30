FROM node:18.16.0-alpine

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max_old_space_size=1024

WORKDIR /usr/app

RUN chown node:node ./
USER node

COPY package*.json ./
# dont download puppeteer package if exists
COPY . .

RUN npm ci --omit=dev
RUN npm run prestart

EXPOSE 5000
CMD [ "node", "app.js"]