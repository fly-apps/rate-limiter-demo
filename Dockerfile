FROM oven/bun
RUN apt-get update && apt-get install -y wget
COPY server.js .
EXPOSE 80
CMD [ "bun", "server.js" ]
