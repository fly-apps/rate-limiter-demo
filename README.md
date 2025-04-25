Machines API demo.

# Step 0 - Setup

* Verify that you have `curl` and `flyctl` installed, and can log into your fly.io account.

* Create an app

    ```
    export APPNAME=demo-$(uuidgen | cut -d '-' -f 5 | tr A-Z a-z)
    fly apps create --name $APPNAME
    fly ips allocate-v4 --shared --app $APPNAME
    fly ips allocate-v6 --app $APPNAME
    export FLY_API_TOKEN=$(fly tokens create deploy --expiry 24h --app $APPNAME)
    export FLY_API_HOSTNAME=https://api.machines.dev
    ```

* Destroy all machines in the app.  There won't be any at this point, but you will want to run this between every step after the first one:

  ```
  fly machines list --app $APPNAME -q | xargs -n 1 fly machine destroy -f --app $APPNAME
  ```

* Optional, but recommended, try running the following command (required Docker to be installed):

    ```
    docker run -p 8080:80 ealen/echo-server
    ```

    VIsit `http://localhost:8080/` in your browser.  You will see some JSON.

# Demo 1 - Machine API

In this demo we are going to run the pre-canned `echo-server` from the previous step on a fly.io Machine.  Without modifying that server, we are going to also run [nginx](https://nginx.org/) configured to be a [rate limiter](https://blog.nginx.org/blog/rate-limiting-nginx).  We are going to configure our guest machine, and set up our HTTP services.

The JSON we will be sending is contained in [api-config.json](./api-config.json). It contains the definition of a [machine](https://machines-api-spec.fly.dev/#model/machine).
We will be focusing mostly on the definition of a [container](https://machines-api-spec.fly.dev/#model/flycontainerconfig).

We see two containers defined: _nginx_ and _echo_. _nginx_ depends on _echo_, and _echo_ has a health check defined that will determine whether or not the container is ready to
accept requests. This is important to prevent requests being routed to the new Machine once it is started (or restarted) until it is ready to accept requests.

Note the `raw_value` contained in that file. It is the base 64 encoded contents of [nginx.conf](./nginx.conf).  You can produce this value yourself by running:

```
base64 -i nginx.conf
```

We can use [curl](https://curl.se/) to send the request:

```
curl -i -X POST \
  -H "Authorization: Bearer ${FLY_API_TOKEN}" -H "Content-Type: application/json" \
  "${FLY_API_HOSTNAME}/v1/apps/${APPNAME}/machines" \
  -d "$(cat api-config.json)"
```

... and you are done!  That was quick.

Visit your application by running the following command:

```
fly apps open --app $APPNAME
```

Again, you will see JSON. Press refresh again rapidly and you will quickly see "503 Service Temporarily Unavailable". Congratuations, you have successfully run both the echo app and nginx configured as a rate limiter on a Fly.io machine.

This demo used `curl`. Any application written in any language that can send HTTP POST requests can be used instead.

When done, delete your machine using the command in the setup section.

# Demo 2(A) - `fly machine run` with precanned app

This time JSON configuration is a bit simpler: [cli-config.json](./cli-config.json). That's because we can load the contents of the `nginix.conf` file directly and we configure our guest machine and services from the command line:

```
flyctl machine run --machine-config cli-config.json \
  --app $APPNAME --autostart=true --autostop=stop \
  --port 80:8080/tcp:http --port 443:8080/tcp:http:tls \
  --vm-cpu-kind shared --vm-cpus 1 --vm-memory 256
```

Once again, visit your application by running the following command:

```
fly apps open --app $APPNAME
```

You may find the `fly machine run` command more convenient for casual experimentation and/or scripting.

When done, delete your machine using the command in the setup section.

# Demo 2(B) - `fly machine run` with custom app

You typically won't be running apps that are prepackaged as Docker images and published to Dockerhub.  To demonstrate running your own app, [server.js](./server.js) contains a small JavaScript application that performs a similar function. We also have a [Dockerfile](./Dockerfile) that runs this application.

We can use the exact same configuration from the previous step and replace the image in the echo container with the one produced by building this app by passing two additional parameters to the `fly machine run` command:

```
flyctl machine run --machine-config cli-config.json \
  --dockerfile Dockerfile --container echo \
  --autostart=true --autostop=stop \
  --port 80:8080/tcp:http --port 443:8080/tcp:http:tls \
  --vm-cpu-kind shared --vm-cpus 1 --vm-memory 256
```

The additional parameters are `--dockerfile` and `--container`. The Dockerfile is used to build an image which is pushed to a repository, and this image replaces the image defined in the echo container.

When done, you can delete everything running the following command:

```
fly apps destroy $APPNAME
```

# Demo 3 - `fly launch`

This is not implemented yet, but the idea is that you can run
`fly launch` to launch your application, add the contents of [cli-config.json](./cli-config.json) into your `fly.toml`, run `fly deploy` and you are up and running.  No need to create an app, allocate ip addresses, create a token, etc.

This is very similar to the approach taken in [deploy support for machine configs with containers #4289](https://github.com/superfly/flyctl/pull/4289).