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

package org.apache.hugegraph.util;

import org.apache.commons.lang3.StringUtils;
import org.apache.hugegraph.exception.ExternalException;

public final class GremlinUtil {

    private static final String[] ESCAPE_SEARCH_LIST = new String[]{
        "\\", "\"", "'", "\r", "\n"
    };
    private static final String[] ESCAPE_TARGET_LIST = new String[]{
        "\\\\", "\\\"", "\\'", "\\r", "\\n"
    };

    public static final String GREMLIN_HLM_SCHEMA =
            "graph.schema().propertyKey('姓名').asText().ifNotExist().create();\n" +
            "graph.schema().propertyKey('性别').asText().ifNotExist().create();\n" +
            "graph.schema().propertyKey('年龄').asInt().ifNotExist().create();\n" +
            "graph.schema().propertyKey('特点').asText().ifNotExist().create();\n" +
            "graph.schema().propertyKey('亲疏').asText().ifNotExist().create();\n" +
            "\n" +
            "graph.schema().vertexLabel('男人')" +
            ".properties('姓名', '性别', '年龄', '特点', '亲疏')" +
            ".primaryKeys('姓名').ifNotExist().create();\n" +
            "graph.schema().vertexLabel('女人')" +
            ".properties('姓名', '性别', '年龄', '特点', '亲疏')" +
            ".primaryKeys('姓名').ifNotExist().create();\n" +
            "graph.schema().vertexLabel('机构')" +
            ".properties('姓名', '特点', '亲疏')" +
            ".primaryKeys('姓名').ifNotExist().create();\n" +
            "\n" +
            "graph.schema().edgeLabel('父子').sourceLabel('男人')" +
            ".targetLabel('男人').ifNotExist().create();\n" +
            "graph.schema().edgeLabel('父女').sourceLabel('男人')" +
            ".targetLabel('女人').ifNotExist().create();\n" +
            "graph.schema().edgeLabel('母子').sourceLabel('女人')" +
            ".targetLabel('男人').ifNotExist().create();\n" +
            "graph.schema().edgeLabel('母女').sourceLabel('女人')" +
            ".targetLabel('女人').ifNotExist().create();\n" +
            "graph.schema().edgeLabel('妻').sourceLabel('男人')" +
            ".targetLabel('女人').ifNotExist().create();\n" +
            "graph.schema().edgeLabel('妾').sourceLabel('男人')" +
            ".targetLabel('女人').ifNotExist().create();\n" +
            "graph.schema().edgeLabel('相恋').sourceLabel('男人')" +
            ".targetLabel('女人').ifNotExist().create();\n" +
            "graph.schema().edgeLabel('朋友').sourceLabel('男人')" +
            ".targetLabel('女人').ifNotExist().create();\n" +
            "graph.schema().edgeLabel('姐妹').sourceLabel('女人')" +
            ".targetLabel('女人').ifNotExist().create();\n" +
            "graph.schema().edgeLabel('丫环').sourceLabel('男人')" +
            ".targetLabel('女人').ifNotExist().create();\n" +
            "graph.schema().edgeLabel('丫头').sourceLabel('女人')" +
            ".targetLabel('女人').ifNotExist().create();\n" +
            "graph.schema().edgeLabel('兵部指挥').sourceLabel('机构')" +
            ".targetLabel('男人').ifNotExist().create();\n" +
            "graph.schema().edgeLabel('巡盐御史').sourceLabel('机构')" +
            ".targetLabel('男人').ifNotExist().create();\n" +
            "graph.schema().edgeLabel('尚书令').sourceLabel('机构')" +
            ".targetLabel('男人').ifNotExist().create();\n\n\n";
    public static final String GREMLIN_HLM_DATA =
            "jiataigong = graph.addVertex(T.label, '男人', '姓名', '贾太公', " +
            "'性别', '男', '年龄', 0, '特点', '-', '亲疏', 'o-l5');\n" +
            "jiayan = graph.addVertex(T.label, '男人', '姓名', '贾演', " +
            "'性别', '男', '年龄', 0, '特点', '-', '亲疏', 'o-l6');\n" +
            "jiadaihua = graph.addVertex(T.label, '男人', '姓名', '贾代化', " +
            "'性别', '男', '年龄', 0, '特点', '-', '亲疏', 'o-l5');\n" +
            "jiayuan = graph.addVertex(T.label, '男人', '姓名', '贾源', " +
            "'性别', '男', '年龄', 0, '特点', '-', '亲疏', 'o-l4');\n" +
            "jiadaishan = graph.addVertex(T.label, '男人', '姓名', '贾代善', " +
            "'性别', '男', '年龄', 0, '特点', '-', '亲疏', 'o-l3');\n" +
            "jiamu = graph.addVertex(T.label, '女人', '姓名', '贾母', " +
            "'性别', '女', '年龄', 0, '特点', '史太君，老祖宗', '亲疏', 'o-l3');\n" +
            "jiajing = graph.addVertex(T.label, '男人', '姓名', '贾敬', " +
            "'性别', '男', '年龄', 0, '特点', '-', '亲疏', 'o-l5');\n" +
            "jiazhen = graph.addVertex(T.label, '男人', '姓名', '贾珍', " +
            "'性别', '男', '年龄', 0, '特点', '-', '亲疏', 'm-l4');\n" +
            "youdajie = graph.addVertex(T.label, '女人', '姓名', '尤氏', " +
            "'性别', '女', '年龄', 0, '特点', '-', '亲疏', 'm-l4');\n" +
            "jiarong = graph.addVertex(T.label, '男人', '姓名', '贾蓉', " +
            "'性别', '男', '年龄', 0, '特点', '-', '亲疏', 'y-l3');\n" +
            "qingkeqing = graph.addVertex(T.label, '女人', '姓名', '秦可卿', " +
            "'性别', '女', '年龄', 0, '特点', '-', '亲疏', 'y-l3');\n" +
            "jiashe = graph.addVertex(T.label, '男人', '姓名', '贾赦', " +
            "'性别', '男', '年龄', 0, '特点', '-', '亲疏', 'o-l4');\n" +
            "jialian = graph.addVertex(T.label, '男人', '姓名', '贾琏', " +
            "'性别', '男', '年龄', 0, '特点', '-', '亲疏', 'm-l3');\n" +
            "wangxifeng = graph.addVertex(T.label, '女人', '姓名', '王熙凤', " +
            "'性别', '女', '年龄', 0, '特点', '-', '亲疏', 'm-l2');\n" +
            "youerjie = graph.addVertex(T.label, '女人', '姓名', '尤二姐', " +
            "'性别', '女', '年龄', 0, '特点', '-', '亲疏', 'm-l3');\n" +
            "pinger = graph.addVertex(T.label, '女人', '姓名', '平儿', " +
            "'性别', '女', '年龄', 0, '特点', '-', '亲疏', 'y-l3');\n" +
            "qiutong = graph.addVertex(T.label, '女人', '姓名', '秋桐', " +
            "'性别', '女', '年龄', 0, '特点', '-', '亲疏', 'y-l3');\n" +
            "jiayingchun = graph.addVertex(T.label, '女人', '姓名', '贾迎春', " +
            "'性别', '女', '年龄', 0, '特点', '-', '亲疏', 'y-l3');\n" +
            "sunshaozu = graph.addVertex(T.label, '男人', '姓名', '孙绍祖', " +
            "'性别', '男', '年龄', 0, '特点', '-', '亲疏', 'y-l3');\n" +
            "jiazheng = graph.addVertex(T.label, '男人', '姓名', '贾政', " +
            "'性别', '男', '年龄', 0, '特点', '-', '亲疏', 'm-l2');\n" +
            "wangfuren = graph.addVertex(T.label, '女人', '姓名', '王夫人', " +
            "'性别', '女', '年龄', 0, '特点', '-', '亲疏', 'm-l2');\n" +
            "zhaoyiniang = graph.addVertex(T.label, '女人', '姓名', '赵姨娘', " +
            "'性别', '女', '年龄', 0, '特点', '-', '亲疏', 'm-l4');\n" +
            "jiahuan = graph.addVertex(T.label, '男人', '姓名', '贾环', " +
            "'性别', '男', '年龄', 0, '特点', '-', '亲疏', 'y-l4');\n" +
            "jiatanchun = graph.addVertex(T.label, '女人', '姓名', '贾探春', " +
            "'性别', '女', '年龄', 0, '特点', '-', '亲疏', 'y-l4');\n" +
            "jiayuanchun = graph.addVertex(T.label, '女人', '姓名', '贾元春', " +
            "'性别', '女', '年龄', 0, '特点', '-', '亲疏', 'y-l3');\n" +
            "jiazhu = graph.addVertex(T.label, '男人', '姓名', '贾珠', " +
            "'性别', '男', '年龄', 0, '特点', '-', '亲疏', 'y-l3');\n" +
            "liwan = graph.addVertex(T.label, '女人', '姓名', '李纨', " +
            "'性别', '女', '年龄', 0, '特点', '-', '亲疏', 'm-l3');\n" +
            "jialan = graph.addVertex(T.label, '男人', '姓名', '贾兰', " +
            "'性别', '男', '年龄', 0, '特点', '-', '亲疏', 'b-l4');\n" +
            "jiabaoyu = graph.addVertex(T.label, '男人', '姓名', '贾宝玉', " +
            "'性别', '男', '年龄', 0, '特点', '-', '亲疏', 'y-l1');\n" +
            "xuebaochai = graph.addVertex(T.label, '女人', '姓名', '薛宝钗', " +
            "'性别', '女', '年龄', 0, '特点', '-', '亲疏', 'y-l2');\n" +
            "jiamin = graph.addVertex(T.label, '女人', '姓名', '贾敏', " +
            "'性别', '女', '年龄', 0, '特点', '-', '亲疏', 'm-l3');\n" +
            "linruhai = graph.addVertex(T.label, '男人', '姓名', '林如海', " +
            "'性别', '男', '年龄', 0, '特点', '-', '亲疏', 'm-l3');\n" +
            "lindaiyu = graph.addVertex(T.label, '女人', '姓名', '林黛玉', " +
            "'性别', '女', '年龄', 0, '特点', '-', '亲疏', 'y-l1');\n" +
            "shihou = graph.addVertex(T.label, '男人', '姓名', '史候', " +
            "'性别', '男', '年龄', 0, '特点', '-', '亲疏', 'o-l6');\n" +
            "shigong = graph.addVertex(T.label, '男人', '姓名', '史公', " +
            "'性别', '男', '年龄', 0, '特点', '-', '亲疏', 'o-l5');\n" +
            "shiba = graph.addVertex(T.label, '男人', '姓名', '史氏', " +
            "'性别', '男', '年龄', 0, '特点', '-', '亲疏', 'o-l4');\n" +
            "shinai = graph.addVertex(T.label, '男人', '姓名', '史鼐', " +
            "'性别', '男', '年龄', 0, '特点', '保龄侯', '亲疏', 'o-l4');\n" +
            "shiding = graph.addVertex(T.label, '男人', '姓名', '史鼎', " +
            "'性别', '男', '年龄', 0, '特点', '忠靖侯', '亲疏', 'o-l4');\n" +
            "shixiangyun = graph.addVertex(T.label, '女人', '姓名', '史湘云', " +
            "'性别', '女', '年龄', 0, '特点', '-', '亲疏', 'y-l3');\n" +
            "weiruolan = graph.addVertex(T.label, '男人', '姓名', '卫若兰', " +
            "'性别', '男', '年龄', 0, '特点', '-', '亲疏', 'm-l4');\n" +
            "xueyima = graph.addVertex(T.label, '女人', '姓名', '薛姨妈', " +
            "'性别', '女', '年龄', 0, '特点', '-', '亲疏', 'm-l3');\n" +
            "\n" +
            "jiataigong.addEdge('父子', jiayan);\n" +
            "jiataigong.addEdge('父子', jiayuan);\n" +
            "jiayan.addEdge('父子', jiadaihua);\n" +
            "jiayuan.addEdge('父子', jiadaishan);\n" +
            "jiadaishan.addEdge('妻', jiamu);\n" +
            "jiadaihua.addEdge('父子', jiajing);\n" +
            "jiajing.addEdge('父子', jiazhen);\n" +
            "jiazhen.addEdge('父子', jiarong);\n" +
            "jiazhen.addEdge('妾', youdajie);\n" +
            "jiarong.addEdge('妻', qingkeqing);\n" +
            "jiashe.addEdge('父子', jialian);\n" +
            "jialian.addEdge('妻', wangxifeng);\n" +
            "jialian.addEdge('妾', youerjie);\n" +
            "jialian.addEdge('妾', pinger);\n" +
            "jialian.addEdge('妾', qiutong);\n" +
            "wangxifeng.addEdge('丫头', pinger);\n" +
            "jiashe.addEdge('丫环', qiutong);\n" +
            "youdajie.addEdge('姐妹', youerjie);\n" +
            "jiashe.addEdge('父女', jiayingchun);\n" +
            "sunshaozu.addEdge('妻', jiayingchun);\n" +
            "jiazheng.addEdge('妻', wangfuren);\n" +
            "jiazheng.addEdge('妾', zhaoyiniang);\n" +
            "zhaoyiniang.addEdge('母子', jiahuan);\n" +
            "zhaoyiniang.addEdge('母女', jiatanchun);\n" +
            "wangfuren.addEdge('母女', jiayuanchun);\n" +
            "wangfuren.addEdge('母子', jiazhu);\n" +
            "jiazhu.addEdge('妻', liwan);\n" +
            "jiazhu.addEdge('父子', jialan);\n" +
            "liwan.addEdge('母子', jialan);\n" +
            "wangfuren.addEdge('母子', jiabaoyu);\n" +
            "jiabaoyu.addEdge('妻', xuebaochai);\n" +
            "linruhai.addEdge('妻', jiamin);\n" +
            "linruhai.addEdge('父女', lindaiyu);\n" +
            "jiamin.addEdge('母女', lindaiyu);\n" +
            "jiabaoyu.addEdge('相恋', lindaiyu);\n" +
            "jiamu.addEdge('母子', jiashe);\n" +
            "jiamu.addEdge('母子', jiazheng);\n" +
            "jiamu.addEdge('母女', jiamin);\n" +
            "jiadaishan.addEdge('父子', jiashe);\n" +
            "jiadaishan.addEdge('父子', jiazheng);\n" +
            "jiadaishan.addEdge('父女', jiamin);\n" +
            "shihou.addEdge('父子', shigong);\n" +
            "shigong.addEdge('父子', shiba);\n" +
            "shigong.addEdge('父子', shinai);\n" +
            "shigong.addEdge('父子', shiding);\n" +
            "shigong.addEdge('父女', jiamu);\n" +
            "shiba.addEdge('父女', shixiangyun);\n" +
            "weiruolan.addEdge('妻', shixiangyun);\n" +
            "jiabaoyu.addEdge('朋友', shixiangyun);\n" +
            "xueyima.addEdge('姐妹', wangfuren);\n" +
            "xueyima.addEdge('母女', xuebaochai);";

    public static final String GREMLIN_LOAD_HLM = GREMLIN_HLM_SCHEMA +
                                                  GREMLIN_HLM_DATA;

    public static final String GREMLIN_COVID19_SCHEMA =
            "\"graph.schema().propertyKey('性别').asText().ifNotExist().create();\\n" +
            "graph.schema().propertyKey('年龄').asInt().ifNotExist().create();\\n" +
            "graph.schema().propertyKey('防疫政策').asText().ifNotExist().create();\\n" +
            "graph.schema().propertyKey('类型').asText().ifNotExist().create();\\n" +
            "graph.schema().propertyKey('时间').asText().ifNotExist().create();\\n" +
            "\\n" +
            "graph.schema().vertexLabel('patient').properties('性别','年龄')" +
            ".useCustomizeStringId().nullableKeys('性别','年龄')" +
            ".enableLabelIndex(false).ifNotExist().create();\\n" +
            "graph.schema().vertexLabel('place')" +
            ".useCustomizeStringId()" +
            ".enableLabelIndex(false).ifNotExist().create();\\n" +
            "graph.schema().vertexLabel('city').properties('防疫政策')" +
            ".useCustomizeStringId().nullableKeys('防疫政策')" +
            ".enableLabelIndex(false).ifNotExist().create();\\n" +
            "graph.schema().vertexLabel('vehicle').properties('类型')" +
            ".useCustomizeStringId().nullableKeys('类型')" +
            ".enableLabelIndex(false).ifNotExist().create();\\n" +
            "\\n" +
            "graph.schema().edgeLabel('relation')" +
            ".sourceLabel('patient').targetLabel('patient')" +
            ".properties('类型').nullableKeys('类型')" +
            ".enableLabelIndex(false).ifNotExist().create();\\n" +
            "graph.schema().edgeLabel('reside')" +
            ".sourceLabel('patient').targetLabel('place')" +
            ".properties('时间').nullableKeys('时间')" +
            ".enableLabelIndex(false).ifNotExist().create();\\n" +
            "graph.schema().edgeLabel('work')" +
            ".sourceLabel('patient').targetLabel('place')" +
            ".properties('时间').nullableKeys('时间')" +
            ".enableLabelIndex(false).ifNotExist().create();\\n" +
            "graph.schema().edgeLabel('stay')" +
            ".sourceLabel('patient').targetLabel('place')" +
            ".properties('时间').nullableKeys('时间')" +
            ".enableLabelIndex(false).ifNotExist().create();" +
            "\\ngraph.schema().edgeLabel('comfirm')" +
            ".sourceLabel('patient').targetLabel('city')" +
            ".properties('时间').nullableKeys('时间')" +
            ".enableLabelIndex(false).ifNotExist().create();\\n" +
            "graph.schema().edgeLabel('take')" +
            ".sourceLabel('patient').targetLabel('vehicle')" +
            ".properties('时间').nullableKeys('时间')" +
            ".enableLabelIndex(false).ifNotExist().create();\\n\\n\"";

    public static String escapeId(Object id) {
        if (!(id instanceof String)) {
            return id.toString();
        }
        return (String) escape(id);
    }

    public static Object escape(Object object) {
        if (!(object instanceof String)) {
            return object;
        }
        String text = (String) object;
        text = StringUtils.replaceEach(text, ESCAPE_SEARCH_LIST,
                                       ESCAPE_TARGET_LIST);
        return StringUtils.wrap(text, '\'');
    }

    public static String optimizeLimit(String gremlin, int limit) {
        return optimizeLimit(gremlin, limit, false);
    }

    public static String optimizePreviewLimit(String gremlin, int limit) {
        return optimizeLimit(gremlin, limit, true);
    }

    private static String optimizeLimit(String gremlin, int limit,
                                        boolean preview) {
        // Default limits are a convenience for ordinary reads, not a resource
        // sandbox for arbitrary Groovy scripts or large individual properties.
        /*
         * Scan the script with quote awareness: track single-quote,
         * double-quote and backslash-escape state so that ';' and true
         * statement-ending newlines are treated as separators only when
         * outside quotes.
         * Read validation and '.limit(N)' appending are applied only to
         * true statement tails (outside quotes).
         */
        StringBuilder result = new StringBuilder(gremlin.length());
        StringBuilder statement = new StringBuilder();
        StringBuilder matchable = new StringBuilder();
        boolean inSingleQuote = false;
        boolean inDoubleQuote = false;
        boolean inLineComment = false;
        boolean inBlockComment = false;
        boolean escaped = false;
        int delimiterDepth = 0;
        for (int i = 0; i < gremlin.length(); i++) {
            char ch = gremlin.charAt(i);
            if (escaped) {
                statement.append(ch);
                matchable.append(ch);
                escaped = false;
                continue;
            }
            if (inLineComment) {
                if (ch == '\n') {
                    if (delimiterDepth != 0 || chainContinues(gremlin, i, matchable)) {
                        statement.append(ch);
                        matchable.append(ch);
                    } else {
                        result.append(optimizeStatement(statement.toString(),
                                                        matchable.toString(),
                                                        limit, preview));
                        result.append(ch);
                        statement.setLength(0);
                        matchable.setLength(0);
                    }
                    inLineComment = false;
                } else {
                    statement.append(ch);
                    matchable.append(' ');
                }
                continue;
            }
            if (inBlockComment) {
                statement.append(ch);
                matchable.append(' ');
                if (ch == '*' && i + 1 < gremlin.length() &&
                    gremlin.charAt(i + 1) == '/') {
                    statement.append('/');
                    matchable.append(' ');
                    i++;
                    inBlockComment = false;
                }
                continue;
            }
            if (!inSingleQuote && !inDoubleQuote &&
                (gremlin.startsWith("'''", i) ||
                 gremlin.startsWith("\"\"\"", i))) {
                return gremlin;
            }
            if (!inSingleQuote && !inDoubleQuote && ch == '$' &&
                i + 1 < gremlin.length() &&
                gremlin.charAt(i + 1) == '/') {
                return gremlin;
            }
            if (!inSingleQuote && !inDoubleQuote && ch == '/' &&
                i + 1 < gremlin.length()) {
                char next = gremlin.charAt(i + 1);
                if (next == '/' || next == '*') {
                    statement.append(ch).append(next);
                    matchable.append("  ");
                    i++;
                    inLineComment = next == '/';
                    inBlockComment = next == '*';
                    continue;
                }
                // This may be a slashy literal or division. Both need a real
                // Groovy lexer to distinguish safely.
                return gremlin;
            }
            if ((inSingleQuote || inDoubleQuote) && ch == '\\') {
                statement.append(ch);
                matchable.append(ch);
                escaped = true;
                continue;
            }
            if (ch == '\'' && !inDoubleQuote) {
                inSingleQuote = !inSingleQuote;
                statement.append(ch);
                matchable.append(ch);
                continue;
            }
            if (ch == '"' && !inSingleQuote) {
                inDoubleQuote = !inDoubleQuote;
                statement.append(ch);
                matchable.append(ch);
                continue;
            }
            if (!inSingleQuote && !inDoubleQuote) {
                if (ch == '(' || ch == '[' || ch == '{') {
                    delimiterDepth++;
                } else if (ch == ')' || ch == ']' || ch == '}') {
                    delimiterDepth--;
                }
            }
            boolean separator = delimiterDepth == 0 &&
                                (ch == ';' || ch == '\n' &&
                                 !chainContinues(gremlin, i, matchable));
            if (separator && !inSingleQuote && !inDoubleQuote) {
                result.append(optimizeStatement(statement.toString(),
                                                matchable.toString(), limit, preview));
                result.append(ch);
                statement.setLength(0);
                matchable.setLength(0);
                continue;
            }
            statement.append(ch);
            matchable.append(ch);
        }
        if (inSingleQuote || inDoubleQuote || inBlockComment) {
            // Unclosed quote: never append '.limit(N)' inside a string
            result.append(statement);
        } else {
            result.append(optimizeStatement(statement.toString(),
                                            matchable.toString(), limit, preview));
        }
        return result.toString();
    }

    private static boolean chainContinues(String gremlin, int newline, CharSequence code) {
        // Comments have already been masked in code, so a trailing dot is
        // significant even when a comment follows it before the newline.
        for (int i = code.length() - 1; i >= 0; i--) {
            if (!Character.isWhitespace(code.charAt(i))) {
                if (code.charAt(i) == '.') {
                    return true;
                }
                break;
            }
        }
        for (int i = newline + 1; i < gremlin.length(); i++) {
            char next = gremlin.charAt(i);
            if (Character.isWhitespace(next)) {
                continue;
            }
            if (next == '/' && i + 1 < gremlin.length()) {
                char afterSlash = gremlin.charAt(i + 1);
                if (afterSlash == '/') {
                    int lineEnd = gremlin.indexOf('\n', i + 2);
                    if (lineEnd < 0) {
                        return false;
                    }
                    i = lineEnd;
                    continue;
                }
                if (afterSlash == '*') {
                    int commentEnd = gremlin.indexOf("*/", i + 2);
                    if (commentEnd < 0) {
                        return false;
                    }
                    i = commentEnd + 1;
                    continue;
                }
            }
            return next == '.';
        }
        return false;
    }

    private static String optimizeStatement(String statement,
                                            String matchable, int limit,
                                            boolean preview) {
        int codeEnd = matchable.length();
        while (codeEnd > 0 && Character.isWhitespace(
                                  matchable.charAt(codeEnd - 1))) {
            codeEnd--;
        }
        String code = matchable.substring(0, codeEnd);
        ReadOnlyGremlin.Syntax syntax;
        try {
            // Reuse read-only validation and shallow call positions. Unknown
            // manual syntax and mutations retain their native execution path.
            syntax = ReadOnlyGremlin.parse(
                    code.replace('\n', ' ').replace('\r', ' '));
        } catch (RuntimeException ignored) {
            return statement;
        }
        if (preview && syntax.collection()) {
            throw new ExternalException("gremlin.preview.collection_requires_async");
        }
        int position = syntax.limitPosition();
        if (position < 0 || preview && syntax.terminalZeroLimit() ||
            !preview && (syntax.explicitLimit() || syntax.collection())) {
            return statement;
        }
        return statement.substring(0, position) + ".limit(" + limit + ")" +
               statement.substring(position);
    }
}
