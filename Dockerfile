FROM node:20-slim

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile

COPY dist/ dist/
RUN mkdir -p data

ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["node", "dist/index.js"]
