# Use the Cypress included image as it has Node and all OS dependencies for Cypress
FROM cypress/included:13.6.6

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production
EXPOSE 3000 4000

CMD ["npm", "run", "dashboard"]
