#!/usr/bin/env bash

DOCKER_DEFAULT_PLATFORM=linux/amd64 docker build -t plugin-builder -f Dockerfile . && docker run --rm -v "$(pwd)":/app -v "/tmp/plugin-builder/go/path":/go -v "/tmp/plugin-builder/go/cache":/tmp/go/cache -w /app plugin-builder
