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

ARG MAVEN_BUILDER_IMAGE=maven:3.9.11-eclipse-temurin-17
FROM --platform=$BUILDPLATFORM ${MAVEN_BUILDER_IMAGE} AS build

WORKDIR /pkg

ARG MAVEN_ARGS

RUN apt-get -q update \
    && apt-get install --no-install-recommends git python3 -yq \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY hugegraph-client/assembly/travis/install-candidate-sdk.sh \
     hugegraph-client/assembly/travis/checkout-server.sh /pkg/hugegraph-client/assembly/travis/
COPY .github/scripts/verify_candidate_image_sdk.py /pkg/.github/scripts/

# Direct builds bootstrap the same locked SDK; CI can supply a verified builder.
RUN mkdir -p /opt/candidate-m2 \
    && if [ ! -f /opt/candidate-m2/candidate-sdk-manifest.json ]; then \
         SERVER_REPOSITORY=apache/hugegraph \
         SERVER_FETCH_REF=d9abcd4317fb36128e7e4d209139ec7f3a28cdfc \
         bash /pkg/hugegraph-client/assembly/travis/install-candidate-sdk.sh \
           d9abcd4317fb36128e7e4d209139ec7f3a28cdfc /opt/candidate-source /opt/candidate-m2; \
       fi \
    && python3 /pkg/.github/scripts/verify_candidate_image_sdk.py /opt/candidate-m2

COPY . /pkg

RUN set -x \
    && mvn clean package $MAVEN_ARGS -Dmaven.repo.local=/opt/candidate-m2 -pl hugegraph-client,hugegraph-loader -am \
       -Dmaven.javadoc.skip=true -DskipTests -ntp \
    && python3 /pkg/.github/scripts/verify_candidate_image_sdk.py /opt/candidate-m2

FROM eclipse-temurin:17-jre-jammy

RUN set -x \
    && apt-get -q update \
    && apt-get -q install -y --no-install-recommends --no-install-suggests \
       dumb-init \
       procps \
       curl \
       lsof \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /pkg/hugegraph-loader/apache-hugegraph-loader-*/ /loader
WORKDIR /loader/

VOLUME /loader

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["tail","-f","/dev/null"]
