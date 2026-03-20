FROM node:22-alpine

WORKDIR /app

# Create package.json for proper dependency management
RUN echo '{"name":"spotify-mock","version":"1.0.0","type":"commonjs"}' > package.json

# Install dependencies locally (not globally)
RUN npm install express cors

# Copy mock server code and fixtures (Spotify/TIDAL)
COPY docker/mock/ ./

EXPOSE 8080

CMD ["node", "server.js"]
