#
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

FROM --platform=$BUILDPLATFORM maven:3.9.11-eclipse-temurin-17 AS build

ENV NODE_OPTIONS=--dns-result-order=ipv4first

ARG MAVEN_ARGS

WORKDIR /pkg

RUN set -x \
    && apt-get -q update \
    && apt-get install curl -yq \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY . /pkg

RUN set -x \
    && mvn install $MAVEN_ARGS -pl hugegraph-client,hugegraph-loader -am -Dmaven.javadoc.skip=true -DskipTests -ntp \
    && cd /pkg/hugegraph-hubble/ \
    && mvn package $MAVEN_ARGS -e -B -ntp -DskipTests -Dmaven.javadoc.skip=true \
    && set -- /pkg/hugegraph-hubble/target/apache-hugegraph-hubble-*.tar.gz \
    && test "$#" -eq 1 \
    && mkdir /hubble-release \
    && tar -xzf "$1" --strip-components=1 -C /hubble-release

FROM eclipse-temurin:17-jre-jammy

RUN apt-get -q update \
    && apt-get install --no-install-recommends curl -yq \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /hubble-release/ /hubble
RUN sed -i \
    -e 's/^server\.host=.*/server.host=0.0.0.0/' \
    -e 's/^dashboard\.address=.*/dashboard.address=/' \
    /hubble/conf/hugegraph-hubble.properties \
    && grep -Fqx 'server.host=0.0.0.0' \
        /hubble/conf/hugegraph-hubble.properties \
    && grep -Fqx 'dashboard.address=' \
        /hubble/conf/hugegraph-hubble.properties
WORKDIR /hubble/

# SECURITY: This is a plain HTTP port. Do not publish it to an untrusted network;
# production/public deployments must put Hubble behind HTTPS and block bypasses.
EXPOSE 8088
ENTRYPOINT ["./bin/start-hubble.sh", "-f"]
