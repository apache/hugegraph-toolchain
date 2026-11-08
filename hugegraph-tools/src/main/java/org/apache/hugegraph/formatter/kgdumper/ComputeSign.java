/*
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

package org.apache.hugegraph.formatter.kgdumper;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class ComputeSign {

    private Map<String, Integer> tradeValue2Num;
    private LinkedHashMap<String, String> entPlain2Id;
    private String inputEncoding;

    public ComputeSign(String tradeValueFile, String inputEncode)
                       throws IOException {

        File file = new File(tradeValueFile);
        Long fileLen = file.length();
        byte[] fileBytes = new byte[fileLen.intValue()];
        try (FileInputStream in = new FileInputStream(file)) {
            in.read(fileBytes);
        }

        tradeValue2Num = new HashMap<>();
        String fileContent = new String(fileBytes);
        String[] lines = fileContent.split("\n");
        for (String line : lines) {
            String[] cols = line.split("\t");
            if (cols.length >= 2) {
                tradeValue2Num.put(cols[0], Integer.valueOf(cols[1]));
            }
        }
        inputEncoding = inputEncode;

        final int cacheSize = 1000;
        final int capacity = (int) Math.ceil(cacheSize / 0.75f) + 1;
        entPlain2Id = new LinkedHashMap<String, String>(capacity, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, String> e) {
                return size() > cacheSize;
            }
        };
    }

    public synchronized String computeSeqNum(String entPlain)
           throws UnsupportedEncodingException {
        String seqNum = "0";
        if (entPlain2Id.containsKey(entPlain)) {
            seqNum = entPlain2Id.get(entPlain);
            return seqNum;
        }

        String[] entSpa = entPlain.split("__");
        if (entSpa.length != 3) {
            return seqNum;
        }
        List<String> trans = new ArrayList<>();
        if (tradeValue2Num.containsKey(entSpa[0])) {
            trans.add(tradeValue2Num.get(entSpa[0]).toString());
        } else {
            trans.add(entSpa[0]);
        }
        trans.add(entSpa[1]);
        if (entSpa[1].contains("trade") &&
            tradeValue2Num.containsKey(entSpa[2])) {
            trans.add(tradeValue2Num.get(entSpa[2]).toString());
        } else {
            trans.add(entSpa[2]);
        }
        if (trans.contains("common") && trans.contains("regioncode")) {
            seqNum = trans.get(2);
        } else {
            String text = String.join("__", trans);
            seqNum = SignFS64.createSignFs64(text, inputEncoding);
        }
        entPlain2Id.put(entPlain, seqNum);
        return seqNum;
    }
}
