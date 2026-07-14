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

package org.apache.hugegraph.controller.auth;

import java.util.ArrayList;
import java.util.List;

import com.baomidou.mybatisplus.core.metadata.IPage;
import org.apache.commons.lang3.StringUtils;
import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.auth.BelongEntity;
import org.apache.hugegraph.service.auth.BelongService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(Constant.API_VERSION + "graphspaces/{graphspace}/auth/belongs")
public class BelongController extends AuthController {

    @Autowired
    private BelongService belongService;

    public List<BelongEntity> list(
            @PathVariable("graphspace") String graphSpace,
            @RequestParam(value = "role_id", required = false) String roleId,
            @RequestParam(value = "user_id", required = false) String userId) {
        HugeClient client = this.requireGraphSpaceManager(graphSpace);
        return this.belongService.list(client, graphSpace, roleId, userId);
    }

    @GetMapping
    public IPage<BelongEntity> listPage(
            @PathVariable("graphspace") String graphSpace,
            @RequestParam(value = "role_id", required = false) String roleId,
            @RequestParam(value = "user_id", required = false) String userId,
            @RequestParam(name = "page_no", required = false,
                          defaultValue = "1") int pageNo,
            @RequestParam(name = "page_size", required = false,
                          defaultValue = "10") int pageSize) {
        HugeClient client = this.requireGraphSpaceManager(graphSpace);
        return this.belongService.listPage(client, graphSpace, roleId, userId,
                                           pageNo, pageSize);
    }

    @GetMapping("{id}")
    public BelongEntity get(@PathVariable("graphspace") String graphSpace,
                            @PathVariable("id") String belongId) {
        HugeClient client = this.requireGraphSpaceManager(graphSpace);
        return this.belongService.get(client, graphSpace, belongId);
    }

    @PostMapping
    public void create(@PathVariable("graphspace") String graphSpace,
                       @RequestBody BelongEntity belongEntity) {
        HugeClient client = this.requireGraphSpaceManager(graphSpace);
        this.belongService.add(client, graphSpace, belongEntity.getRoleId(),
                               belongEntity.getUserId());
    }

    @PostMapping("ids")
    public void createMany(@PathVariable("graphspace") String graphSpace,
                           @RequestBody BelongService.BelongsReq belongsReq) {
        HugeClient client = this.requireGraphSpaceManager(graphSpace);
        for (String userId : belongsReq.getUserIds()) {
            this.belongService.add(client, graphSpace,
                                   belongsReq.getRoleId(), userId);
        }
    }

    @DeleteMapping("{id}")
    public void delete(@PathVariable("graphspace") String graphSpace,
                       @PathVariable("id") String belongId) {
        HugeClient client = this.requireGraphSpaceManager(graphSpace);
        this.belongService.deleteById(client, graphSpace, belongId);
    }

    @DeleteMapping
    public void delete(@PathVariable("graphspace") String graphSpace,
                       @RequestParam("role_id") String roleId,
                       @RequestParam("user_id") String userId) {
        HugeClient client = this.requireGraphSpaceManager(graphSpace);
        if (StringUtils.isNotEmpty(roleId) && StringUtils.isNotEmpty(userId)) {
            this.belongService.delete(client, graphSpace, roleId, userId);
        }
    }

    @PostMapping("delids")
    public void deleteMany(@PathVariable("graphspace") String graphSpace,
                           @RequestBody DelIdsReq delIdsReq) {
        HugeClient client = this.requireGraphSpaceManager(graphSpace);
        this.belongService.deleteMany(client, graphSpace,
                                      delIdsReq.ids.toArray(new String[0]));
    }

    public static class DelIdsReq {

        public List<String> ids = new ArrayList<>();
    }
}
