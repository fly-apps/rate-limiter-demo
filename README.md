Machines API demo.

The following will demonstrate running two containers on a single machine:
a simple echo app and [nginx](https://nginx.org/) configured to be a [rate limiter](https://blog.nginx.org/blog/rate-limiting-nginx).  Nginx will require
a configuration file and will depend on the echo app being healthy.  The echo app will have a health
check defined: running [wget](https://www.gnu.org/software/wget/) to verify that the server is up.

The demos below will show you how to do this with the machines API, fly machine run, and fly launch.
And will demonstrate running an existing echo server as well as one that you provide.

# Step 0 - Setup

These instructions should work on Linux, MacOS, and Windows WSL2.

* Verify that you have [`curl`](https://curl.se/docs/install.html) and [`flyctl`](https://fly.io/docs/flyctl/install/) installed, and can [log into](https://fly.io/docs/flyctl/auth-login/) your fly.io account.

* Create an app, a shared IPv4 address, a dedicated IPv6 address, a token, and set the fly API hostname.

    ```
    export APPNAME=demo-$(uuidgen | cut -d '-' -f 5 | tr A-Z a-z)
    fly apps create --name $APPNAME
    fly ips allocate-v4 --shared --app $APPNAME
    fly ips allocate-v6 --app $APPNAME
    export FLY_API_TOKEN=$(fly tokens create deploy --expiry 24h --app $APPNAME)
    export FLY_API_HOSTNAME=https://api.machines.dev
    ```

* Destroy all machines in the app.  There won't be any at this point, but you will want to run this between every step:

  ```
  fly machines list --app $APPNAME -q | xargs -n 1 fly machine destroy -f --app $APPNAME
  ```

* Optional, but recommended, try running the [ealen/echo-server](https://hub.docker.com/r/ealen/echo-server) on your own machine using Docker (if you don't already have Docker installed, you can find the instructions [here](https://www.docker.com/get-started/)):

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

You can ssh into either container using `fly ssh console`:

```
fly ssh console --container nginx
fly ssh console --container echo
```

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

You may find the `fly machine run` command to be useful for casual experimentation and/or scripting.

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

The additional parameters are `--dockerfile` and `--container`. The Dockerfile is used to build an image which is pushed to a repository, and this image replaces the image defined in the echo container.  The
default for container is to look for a container named "app" first, and if not found use the first one.

Note that while we have been destroying machines and running new ones, we could instead opt to update
and existing one:

```
fly machine list -q | xargs fly machine update --yes --dockerfile Dockerfile --container echo
```

When done, you can delete everything running the following command:

```
fly apps destroy $APPNAME
```

# Demo 3 - `fly launch`

In this demo we are going to launch our bun server as a new application, then we will add the rate limiter.  To make it easier to trigger the
rate limiter later, we are going to opt out of running in a high availability configuration:

```sh
fly launch --ha=false
```

At this point, we have a `fly.toml` that configures a `http_service` and our `vm`.  We can visit the app, but at this point there is no rate limiters.

We can add our desired machine configuration to the `fly.toml` by adding the following two lines above the `[build]` section:

```toml
machine_config = 'cli-config.json'
container = 'echo'
```

Once again, you will not normally need to specify the container as `fly deploy` will first look for a container named `app`, and if none are found it will select the first app.  In this case we want the image we build to replace the definition of the second app, named `echo`.

We make one further change, we change the internal port to '8080' so that traffic will be routed to the http server:

```toml
  internal_port = 8080
```

Once this change is made, we run `fly deploy`.  If we visit the app now we can quickly trigger the "503 Service Temporarily Unavailable" available message.

`fly deploy` may be more convenient than `fly machine run` when you are starting out, and can update multiple identically
configured machines with one command.

In the above we are using a `cli-config.json` in a separate file.  You can also embed it directly into your `fly.toml` using triple quotes.  Just make sure that the first character in the string is `{`:

```
machine_config = '''[
  "containers": [
    …
  ]
]'''
```

While these demos progressed from using the machine API directly to `fly launch`, a more common progression is in the other
direction - you start out simple and as your needs change and you want to take greater advantage of what Fly.io has to offer
you take advantage of the interface that is most suited to your needs.
