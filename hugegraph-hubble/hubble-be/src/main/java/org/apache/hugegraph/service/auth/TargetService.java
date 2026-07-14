/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

package org.apache.hugegraph.service.auth;

import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

import com.baomidou.mybatisplus.core.metadata.IPage;
import lombok.extern.log4j.Log4j2;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.exception.ForbiddenException;
import org.apache.hugegraph.structure.auth.Target;
import org.apache.hugegraph.util.PageUtil;
import org.springframework.stereotype.Service;

@Log4j2
@Service
public class TargetService extends AuthService {

    private static final String PD_DEFAULT_TARGET = "DEFAULT_SPACE_TARGET";

    public List<Target> list(HugeClient client) {
        return client.auth().listTargets().stream()
                     .filter(target -> !isPdDefaultTarget(target))
                     .collect(Collectors.toList());
    }

    public List<Target> list(HugeClient client, String graphSpace) {
        return this.list(client).stream()
                   .filter(target -> belongsToGraphSpace(
                           graphSpace, target.graphSpace()))
                   .collect(Collectors.toList());
    }

    public IPage<Target> queryPage(HugeClient client, String query,
                                   int pageNo, int pageSize) {
        return this.queryPage(client, null, query, pageNo, pageSize);
    }

    public IPage<Target> queryPage(HugeClient client, String graphSpace,
                                   String query, int pageNo, int pageSize) {
        List<Target> results =
                (graphSpace == null ? this.list(client) :
                 this.list(client, graphSpace)).stream()
                    .filter(target -> target.name().toLowerCase()
                                            .contains(query.toLowerCase()))
                    .sorted(Comparator.comparing(Target::name))
                    .collect(Collectors.toList());
        return PageUtil.page(results, pageNo, pageSize);
    }

    public Target get(HugeClient client, String targetId) {
        Target target = client.auth().getTarget(targetId);
        if (target == null) {
            throw new ExternalException("auth.target.not-exist.id", targetId);
        }
        requireCustomTarget(target);
        return target;
    }

    public Target get(HugeClient client, String graphSpace, String targetId) {
        Target target = this.get(client, targetId);
        requireGraphSpace(graphSpace, target.graphSpace(), "target");
        return target;
    }

    public Target add(HugeClient client, String graphSpace, Target target) {
        requireCustomTarget(target);
        if (target.graphSpace() != null) {
            requireGraphSpace(graphSpace, target.graphSpace(), "target");
        }
        target.graphSpace(graphSpace);
        return this.add(client, target);
    }

    public Target add(HugeClient client, Target target) {
        return client.auth().createTarget(target);
    }

    public Target update(HugeClient client, Target target) {
        requireCustomTarget(target);
        return client.auth().updateTarget(target);
    }

    public Target update(HugeClient client, String graphSpace, Target target) {
        requireGraphSpace(graphSpace, target.graphSpace(), "target");
        target.graphSpace(graphSpace);
        return this.update(client, target);
    }

    public void delete(HugeClient client, String targetId) {
        client.auth().deleteTarget(targetId);
    }

    public void delete(HugeClient client, String graphSpace, String targetId) {
        this.get(client, graphSpace, targetId);
        this.delete(client, targetId);
    }

    static boolean isPdDefaultTarget(Target target) {
        return target != null && isPdDefaultTargetName(target.name());
    }

    private static boolean isPdDefaultTargetName(String name) {
        return name != null && (PD_DEFAULT_TARGET.equals(name) ||
                                name.endsWith("_" + PD_DEFAULT_TARGET));
    }

    private static void requireCustomTarget(Target target) {
        if (isPdDefaultTarget(target)) {
            throw new ForbiddenException(
                    "Permission denied: manage PD default target");
        }
    }
}
