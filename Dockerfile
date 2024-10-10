FROM debian:bullseye-slim

RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    make \
    git \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN curl -LO https://golang.org/dl/go1.19.3.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go1.19.3.linux-amd64.tar.gz \
    && rm go1.19.3.linux-amd64.tar.gz

ENV PATH="/usr/local/go/bin:${PATH}"
ENV GOPATH="/go"
ENV GOROOT="/usr/local/go"
ENV GOCACHE="/tmp/go/cache"

WORKDIR /app

CMD ["make", "dist"]
