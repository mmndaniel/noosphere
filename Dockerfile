FROM node:20-slim AS build

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY src/ src/
RUN npx esbuild src/index.ts --bundle --platform=node --format=esm --outfile=dist/index.js --packages=external

FROM node:20-slim

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile

COPY --from=build /app/dist dist/
RUN mkdir -p data

ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["node", "dist/index.js"]
