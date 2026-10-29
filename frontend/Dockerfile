# SkillMap web app (28 Oct, TC-67): build with Node, serve the files with nginx.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
# Vite bakes these in at build time: the API address the browser uses, and the contact shown in the privacy notice
ARG VITE_API_URL=http://localhost:8000
ARG VITE_PRIVACY_CONTACT=careers@university.example
ENV VITE_API_URL=$VITE_API_URL VITE_PRIVACY_CONTACT=$VITE_PRIVACY_CONTACT
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
