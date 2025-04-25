const server = Bun.serve({
  port: 80,
  fetch(request) {
    let output = {
      time: new Date(),
      host: server.hostname,
      headers: request.headers
    }
    return new Response(JSON.stringify(output, null, 2))
  },
})

console.log(`Listening on ${server.url}`)
