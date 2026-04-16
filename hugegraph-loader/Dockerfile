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

FROM maven:3.9.0-eclipse-temurin-11 AS build

COPY . /pkg
WORKDIR /pkg

ARG MAVEN_ARGS

RUN set -x \
    && mvn install $MAVEN_ARGS -pl hugegraph-client,hugegraph-loader -am -Dmaven.javadoc.skip=true -DskipTests -ntp

RUN set -x \
    && cd /pkg/hugegraph-loader/ \
    && echo "$(ls)" \
    && mvn clean package $MAVEN_ARGS -DskipTests

FROM eclipse-temurin:11-jre-jammy

COPY --from=build /pkg/hugegraph-loader/apache-hugegraph-loader-*/ /loader
WORKDIR /loader/

RUN set -x \
    && apt-get -q update \
    && apt-get -q install -y --no-install-recommends --no-install-suggests \
       dumb-init \
       procps \
       curl \
       lsof \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

VOLUME /loader

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["tail","-f","/dev/null"]
