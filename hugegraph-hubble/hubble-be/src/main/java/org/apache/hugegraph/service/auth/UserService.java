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

import java.io.File;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.common.Response;
import org.apache.hugegraph.structure.auth.Login;
import org.apache.hugegraph.options.HubbleOptions;
import lombok.extern.log4j.Log4j2;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.AuthManager;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.auth.UserEntity;
import org.apache.hugegraph.exception.InternalException;
import org.apache.hugegraph.structure.auth.User;
import org.apache.hugegraph.util.HubbleUtil;
import org.apache.hugegraph.util.PageUtil;

import com.csvreader.CsvReader;

import org.springframework.web.multipart.MultipartFile;

@Log4j2
@Service
public class UserService extends AuthService {

    public static final String CREATE_SUCCESS = "successfully created";

    //@Autowired
    //BelongService belongService;

    @Autowired
    ManagerService managerService;

    @Autowired
    private HugeConfig config;

    private boolean isPdEnabled() {
        return config.get(HubbleOptions.PD_ENABLED);
    }

    public List<UserEntity> listUsers(HugeClient hugeClient) {
        AuthManager auth = hugeClient.auth();

        List<User> users = auth.listUsers();
        List<UserEntity> ues = new ArrayList<>(users.size());
        Map<String, Integer> countMap = new HashMap<>();
        Map<String, List<String>> spaceMap = new HashMap<>();
        users.forEach(u -> {
            UserEntity ue = convert(hugeClient, u);
            if (isPdEnabled()) {
                ue.setSuperadmin(isSuperAdmin(hugeClient, ue.getId()));
            } else {
                ue.setSuperadmin(isStandaloneAdmin(ue.getName()));
            }
            ues.add(ue);
        });
        if (isPdEnabled()) {
            List<Object> listMap = getSpaceAndSpacenum(hugeClient);
            spaceMap = HubbleUtil.uncheckedCast(listMap.get(0));
            countMap = HubbleUtil.uncheckedCast(listMap.get(1));
            for (UserEntity user : ues) {
                user.setSpacenum(countMap.get(user.getName()));
                user.setAdminSpaces(spaceMap.get(user.getName()));
            }
        }

        return ues;
    }

    public UserEntity getUser(HugeClient client, String name) {
        return convert(client, client.auth().getUserByName(name));
    }

    public Object queryPage(HugeClient hugeClient, String query,
                            int pageNo, int pageSize) {
        AuthManager auth = hugeClient.auth();
        Map<String, Integer> countMap = new HashMap<>();
        Map<String, List<String>> spaceMap = new HashMap<>();

        List<UserEntity> results =
                hugeClient.auth().listUsers().stream()
                        .filter((u) -> u.name().contains(query) ||
                                u.nickname() != null && u.nickname().contains(query))
                        .sorted(Comparator.comparing(User::name))
                        .map((u) -> {
                            UserEntity ue = convert(hugeClient, u);
                            return ue;
                        }).collect(Collectors.toList());

        if (isPdEnabled()) {
            List<Object> listMap = getSpaceAndSpacenum(hugeClient);
            spaceMap = HubbleUtil.uncheckedCast(listMap.get(0));
            countMap = HubbleUtil.uncheckedCast(listMap.get(1));
            for (UserEntity user : results) {
                user.setSpacenum(countMap.get(user.getName()));
                user.setAdminSpaces(spaceMap.get(user.getName()));
                user.setSuperadmin(isSuperAdmin(hugeClient, user.getId()));
            }
        } else {
            for (UserEntity user : results) {
                user.setSuperadmin(isStandaloneAdmin(user.getName()));
            }
        }
        return PageUtil.page(results, pageNo, pageSize);
    }

    public UserEntity get(HugeClient hugeClient, String userId) {
        AuthManager auth = hugeClient.auth();
        User user = auth.getUser(userId);
        if (user == null) {
            throw new InternalException("auth.user.get.%s Not Exits",
                    userId);
        }
        UserEntity userEntity = convert(hugeClient, user);
        if (isPdEnabled()) {
            userEntity.setSuperadmin(isSuperAdmin(hugeClient, userEntity.getId()));
            List<String> spaces = hugeClient.graphSpace().listGraphSpace();
            List<Object> listMap = getSpaceAndSpacenum(hugeClient);
            Map<String, List<String>> spaceMap =
                    HubbleUtil.uncheckedCast(listMap.get(0));
            List<String> adminSpaces = spaceMap.get(userId);
            List<String> resSpaces = new ArrayList<>();
            for (String space : spaces) {
                if (hugeClient.graphSpace().checkDefaultRole(space, userId, "analyst")) {
                    resSpaces.add(space);
                }
            }
            resSpaces.addAll(adminSpaces);
            userEntity.setAdminSpaces(adminSpaces);
            userEntity.setSpacenum(adminSpaces.size());
            userEntity.setResSpaces(resSpaces);
        } else {
            userEntity.setSuperadmin(isStandaloneAdmin(user.name()));
            userEntity.setAdminSpaces(new ArrayList<>());
            userEntity.setSpacenum(0);
            userEntity.setResSpaces(new ArrayList<>());
        }
        return userEntity;
    }

    public UserEntity getpersonal(HugeClient hugeClient, String username) {
        AuthManager auth = hugeClient.auth();
        User user = auth.getUserByName(username);
        if (user == null) {
            throw new InternalException("auth.user.get.%s Not Exits",
                    username);
        }
        UserEntity userEntity = convert(hugeClient, user);
        if (isPdEnabled()) {
            userEntity.setSuperadmin(isSuperAdmin(hugeClient));
            List<String> adminSpaces = new ArrayList<>();
            List<String> resSpaces = new ArrayList<>();
            List<String> spaces = hugeClient.graphSpace().listGraphSpace();
            for (String space : spaces) {
                if (hugeClient.auth().isSpaceAdmin(space)) {
                    adminSpaces.add(space);
                }
                if (hugeClient.auth().isSpaceAdmin(space) ||
                        hugeClient.auth().checkDefaultRole(space, "analyst")) {
                    resSpaces.add(space);
                }
            }
            userEntity.setAdminSpaces(adminSpaces);
            userEntity.setSpacenum(adminSpaces.size());
            userEntity.setResSpaces(resSpaces);
        } else {
            userEntity.setSuperadmin(isStandaloneAdmin(username));
            userEntity.setAdminSpaces(new ArrayList<>());
            userEntity.setSpacenum(0);
            userEntity.setResSpaces(new ArrayList<>());
        }
        return userEntity;
    }

    public void add(HugeClient client, UserEntity ue) {
        User user = new User();
        user.name(ue.getName());
        user.password(ue.getPassword());
        user.phone(ue.getPhone());
        user.email(ue.getEmail());
        user.avatar(ue.getAvatar());
        user.description(ue.getDescription());
        if (isPdEnabled()) {
            user.nickname(ue.getNickname());
        }

        User newUser = client.auth().createUser(user);
        if (ue.getAdminSpaces() != null) {
            for (String graphspace : ue.getAdminSpaces()) {
                client.auth().addSpaceAdmin(ue.getName(), graphspace);
            }
        }

        if (newUser != null && ue.isSuperadmin()) {
            // add superadmin
            client.auth().addSuperAdmin(newUser.id().toString());
        }
    }

    public String addbatch(HugeClient client, MultipartFile csvFile) {
        File file = multipartFileToFile(csvFile);
        try {
            Map<String, Object> csv = readCsvByCsvReader(file);
            List<Map<String, String>> createBatchBody =
                    HubbleUtil.uncheckedCast(csv.get("data"));
            Map<String, List<Map<String, String>>> result =
                    client.auth().createBatch(createBatchBody);
            List<Map<String, String>> resultList = result.get("result");
            List<String> failedList = new ArrayList<>(createBatchBody.size());
            for (Map<String, String> entry : resultList) {
                if (!CREATE_SUCCESS.equals(entry.get("result"))) {
                    failedList.add(entry.get("user_name"));
                }
            }
            if (!failedList.isEmpty()) {
                throw new InternalException("auth.user.batch-create.failed",
                                            failedList);
            }
            return "success";
        } finally {
            if (!file.delete()) {
                log.warn("Failed to delete temporary user import file '{}'; " +
                         "it will be removed by the operating system", file);
            }
        }
    }

    public File multipartFileToFile(MultipartFile multiFile) {
        File file = null;
        try {
            String originalName = multiFile.getOriginalFilename();
            String suffix = ".tmp";
            if (originalName != null) {
                int dot = originalName.lastIndexOf('.');
                String candidate = dot >= 0 ? originalName.substring(dot) : "";
                if (candidate.matches("\\.[A-Za-z0-9]{1,16}")) {
                    suffix = candidate;
                }
            }
            file = File.createTempFile("hubble-user-import-", suffix);
            multiFile.transferTo(file);
            return file;
        } catch (Exception e) {
            log.error("Failed to create a temporary file for user import", e);
            if (file != null && file.exists() && !file.delete()) {
                log.warn("Failed to delete incomplete user import file '{}'",
                         file);
            }
            throw new InternalException("auth.user.import-file.failed", e);
        }
    }

    public Map<String, Object> readCsvByCsvReader(File file) {
        if (file == null) {
            throw new InternalException("auth.user.import-file.failed");
        }
        Map<String, Object> mapData = new HashMap<>();
        String fileName = file.getName();
        mapData.put("sheetName", fileName);

        List<String> strList = new ArrayList<>();
        List<Map<String, Object>> list = new ArrayList<>();
        try {
            List<String[]> arrList = new ArrayList<String[]>();
            CsvReader reader = new CsvReader(file.getPath(), ',', Charset.forName("UTF-8"));
            // 读取表头
            reader.readHeaders();
            String[] headArray = reader.getHeaders();
            while (reader.readRecord()) {
                // 按行读取，并把每一行的数据添加到list集合
                arrList.add(reader.getValues());
            }
            reader.close();
            // 如果要返回 String[] 类型的 list 集合，则直接返回 arrList
            // 以下步骤是把 String[] 类型的 list 集合转化为 String 类型的 list 集合
            for (int i = 0; i < arrList.size(); i++) {
                // 组装String字符串
                // 如果不知道有多少列，则可再加一个循环
                Map<String, Object> map = new HashMap<>();
                for (int j = 0; j < arrList.get(0).length; j++) {
                    map.put("" + headArray[j] + "", arrList.get(i)[j]);
                }
                list.add(map);
            }
        } catch (Exception e) {
            log.error("Failed to parse the user import CSV file", e);
            throw new InternalException("auth.user.import-csv.failed", e);
        }
        mapData.put("data", list);
        return mapData;
    }

    public void delete(HugeClient hugeClient, String userId) {
        hugeClient.auth().deleteUser(userId);
    }

    protected UserEntity convert(HugeClient client, User user) {
        if (user == null) {
            return null;
        }

        UserEntity u = new UserEntity();
        u.setId(user.id().toString());
        u.setName(user.name());
        u.setNickname(user.nickname());
        u.setEmail(user.email());
        u.setPhone(user.phone());
        u.setAvatar(user.avatar());
        u.setDescription(user.description());
        u.setCreate(user.createTime());
        u.setUpdate(user.updateTime());
        u.setCreator(user.creator());

        return u;
    }

    protected List<Object> getSpaceAndSpacenum(HugeClient hugeClient) {
        AuthManager auth = hugeClient.auth();
        List<Object> listMap = new ArrayList<>();
        if (!isPdEnabled()) {
            // Non-PD mode: no GraphSpace/Manager APIs available
            listMap.add(new HashMap<>());
            listMap.add(new HashMap<>());
            return listMap;
        }
        List<User> users = auth.listUsers();
        List<String> spaces = hugeClient.graphSpace().listGraphSpace();
        Map<String, Integer> countMap = new HashMap<>();
        Map<String, List<String>> spaceMap = new HashMap<>();
        for (User user : users) {
            countMap.put(user.name(), 0);
            spaceMap.put(user.name(), new ArrayList<>());
        }

        for (String space : spaces) {
            List<String> spaceManagers =
                    hugeClient.auth().listSpaceAdmin(space);
            for (String spaceManager : spaceManagers) {
                countMap.put(spaceManager, countMap.get(spaceManager) + 1);
                List<String> tempspace = spaceMap.get(spaceManager);
                tempspace.add(space);
            }
        }
        listMap.add(spaceMap);
        listMap.add(countMap);
        return listMap;
    }

    public void update(HugeClient hugeClient, UserEntity userEntity) {
        User user = new User();
        user.setId(userEntity.getId());
        user.name(userEntity.getName());
        user.password(userEntity.getPassword());
        user.phone(userEntity.getPhone());
        user.email(userEntity.getEmail());
        user.description(userEntity.getDescription());
        if (isPdEnabled()) {
            user.nickname(userEntity.getNickname());
        }
        updateAdminSpace(hugeClient, userEntity.getName(), userEntity.getAdminSpaces());

        // 设置超级管理员权限
        boolean curSuperAdmin = isSuperAdmin(hugeClient, user.id().toString());
        if (curSuperAdmin && !userEntity.isSuperadmin()) {
            hugeClient.auth().delSuperAdmin(user.id().toString());
        }
        if (!curSuperAdmin && userEntity.isSuperadmin()) {
            hugeClient.auth().addSuperAdmin(user.id().toString());
        }

        hugeClient.auth().updateUser(user);
    }

    public void updatePersonal(HugeClient hugeClient, String username,
                               String nickname, String description) {
        AuthManager auth = hugeClient.auth();
        User user = auth.getUserByName(username);
        if (isPdEnabled()) {
            user.nickname(nickname);
        } else {
            user.nickname(null);
        }
        user.description(description);
        user.password(null);
        hugeClient.auth().updateUser(user);
    }

    public Response updatepwd(HugeClient hugeClient, String username,
                              String oldpwd, String newpwd) {
        Login login = new Login();
        login.name(username);
        login.password(oldpwd);
        try {
            hugeClient.auth().login(login);
        } catch (Exception e) {
            return Response.builder()
                    .status(Constant.STATUS_BAD_REQUEST)
                    .message(e.getMessage())
                    .cause(null)
                    .build();
        }
        // Must fetch user first to get the ID, otherwise updateUser sends
        // PUT to the collection path (no {id}) and gets HTTP 405.
        User user = hugeClient.auth().getUserByName(username);
        user.password(newpwd);
        hugeClient.auth().updateUser(user);
        return Response.builder()
                .status(Constant.STATUS_OK)
                .build();
    }

    public List<String> listAdminSpace(HugeClient hugeClient, String username) {
        if (!isPdEnabled()) {
            return new ArrayList<>();
        }
        AuthManager auth = hugeClient.auth();
        List<User> users = auth.listUsers();
        List<String> spaces = hugeClient.graphSpace().listGraphSpace();
        List<String> adminspace = new ArrayList<String>();
        for (String space : spaces) {
            List<String> spaceManagers =
                    hugeClient.auth().listSpaceAdmin(space);
            for (String spaceManager : spaceManagers) {
                if (spaceManager.equals(username)) {
                    adminspace.add(space);
                }
            }
        }
        return adminspace;
    }

    public void updateAdminSpace(HugeClient hugeClient, String username,
                                 List<String> adminspaces) {
        if (adminspaces == null || !isPdEnabled()) {
            return;
        }
        List<String> oldadminspaces = listAdminSpace(hugeClient, username);
        for (String adminspace : adminspaces) {
            if (!oldadminspaces.contains(adminspace)) {
                hugeClient.auth().addSpaceAdmin(username, adminspace);
            }
        }
        for (String oldadminspace : oldadminspaces) {
            if (!adminspaces.contains(oldadminspace)) {
                hugeClient.auth().delSpaceAdmin(username, oldadminspace);
            }
        }
    }

    public String userLevel(HugeClient client, String username) {
        if (!isPdEnabled()) {
            return standaloneUserLevel(username);
        }

        if (isSuperAdmin(client)) {
            return "ADMIN";
        }

        if (isSpaceAdmin(client)) {
            return "SPACEADMIN";
        }

        // Default: user
        return "USER";
    }

    static String standaloneUserLevel(String username) {
        // StandardAuthenticator reserves the configured administrator account
        // name. Other authenticated users still depend on explicit role grants.
        return "admin".equals(username) ? "ADMIN" : "USER";
    }

    private static boolean isStandaloneAdmin(String username) {
        return "ADMIN".equals(standaloneUserLevel(username));
    }

    public boolean isSuperAdmin(HugeClient client, String uid) {
        if (!isPdEnabled()) {
            return false;
        }
        // Only used by superadmin
        // Check: if user is spaceadmin for any graphspace
        return client.auth().listSuperAdmin().contains(uid);
    }

    public boolean isSuperAdmin(HugeClient client) {
        if (!isPdEnabled()) {
            return false;
        }
        // Check: if current user is superadmin
        return client.auth().isSuperAdmin();
    }

    /*
    public boolean isAssignSpaceAdmin(HugeClient client, String uid,
                                      String graphSpace) {
        // Only used by superadmin
        // Check: if user is spaceadmin for one graphSpace
        return client.auth().listSpaceAdmin(graphSpace).contains(uid);
    }
     */

    public boolean isAssignSpaceAdmin(HugeClient client, String graphSpace) {
        if (!isPdEnabled()) {
            return false;
        }
        // Check: if current user is spaceadmin
        return client.auth().isSpaceAdmin(graphSpace);
    }

    public boolean isSpaceAdmin(HugeClient client) {
        if (!isPdEnabled()) {
            return false;
        }
        // Check: if current user is spaceadmin
        List<String> graphSpaces = client.graphSpace().listGraphSpace();
        for (String gs : graphSpaces) {
            if (isAssignSpaceAdmin(client, gs)) {
                return true;
            }
        }

        return false;
    }

    // List graphspace admin
    public List<String> listGraphSpaceAdmin(HugeClient client,
                                          String graphSpace) {
        if (!isPdEnabled()) {
            return new ArrayList<>();
        }
        AuthManager auth = client.auth();

        return auth.listSpaceAdmin(graphSpace);
    }
}
