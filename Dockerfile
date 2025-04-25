FROM oven/bun
COPY server.js .
EXPOSE 80
CMD [ "bun", "server.js" ]
