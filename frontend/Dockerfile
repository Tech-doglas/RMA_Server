# Step 1: Build React app
FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Step 2: Serve with nginx
FROM nginx:stable-alpine
COPY --from=builder /app/build /usr/share/nginx/html

# Keep Nginx on 80, expose port 80 inside container
EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
