FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .

ENV NODE_ENV=production
EXPOSE 3000

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "const http=require('http');const req=http.get({host:'127.0.0.1',port:process.env.PORT||3000,path:'/healthz',timeout:4000},res=>process.exit(res.statusCode===200?0:1));req.on('error',()=>process.exit(1));req.on('timeout',()=>{req.destroy();process.exit(1);});"

CMD ["npm", "start"]
