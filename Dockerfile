# Use the Cypress included image as it has Node and all OS dependencies for Cypress
FROM cypress/included:13.6.6

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json if available
COPY package*.json ./

# Install dependencies (only if node_modules don't exist in build context)
RUN npm install

# Copy the rest of the application
COPY . .

# Environment variables can be passed at runtime or via docker-compose
ENV NODE_ENV=production

# The default command is just to keep the container alive if needed, 
# or it can be overridden by docker-compose
CMD ["npm", "run", "test:api"]
