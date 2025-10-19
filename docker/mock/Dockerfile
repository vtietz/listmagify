FROM node:22-alpine

WORKDIR /app

# Create package.json for proper dependency management
RUN echo '{"name":"spotify-mock","version":"1.0.0","type":"commonjs"}' > package.json

# Install dependencies locally (not globally)
RUN npm install express cors

# Copy only the mock server code
# Fixtures will be mounted as volume for instant updates
COPY docker/mock/server.js .

EXPOSE 8080

CMD ["node", "server.js"]
