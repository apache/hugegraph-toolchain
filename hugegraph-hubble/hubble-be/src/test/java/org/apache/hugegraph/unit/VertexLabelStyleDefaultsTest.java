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

package org.apache.hugegraph.unit;

import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.junit.Assert;
import org.junit.Test;
import org.mockito.Mockito;

import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.driver.SchemaManager;
import org.apache.hugegraph.entity.schema.VertexLabelEntity;
import org.apache.hugegraph.entity.schema.VertexLabelStyle;
import org.apache.hugegraph.service.schema.SchemaService;
import org.apache.hugegraph.service.schema.VertexLabelService;
import org.apache.hugegraph.structure.schema.VertexLabel;
import org.apache.hugegraph.util.JsonUtil;

public class VertexLabelStyleDefaultsTest {

    @Test
    public void testUnstyledLabelsHaveStableColorsAcrossReadOrder() {
        VertexLabel person = label("Person");
        VertexLabel team = label("Team");
        VertexLabel project = label("Project");
        HugeClient client = client(person, team, project);
        Mockito.when(client.schema().getVertexLabels())
               .thenReturn(List.of(person, team, project),
                           List.of(project, person, team));

        Map<String, String> first = colors(new VertexLabelService().list(client));
        Map<String, String> reordered = colors(new VertexLabelService().list(client));

        Assert.assertEquals(3, new HashSet<>(first.values()).size());
        Assert.assertEquals(first, reordered);
        first.forEach((name, color) -> {
            Assert.assertTrue(color.matches("#[0-9A-Fa-f]{6}"));
            Assert.assertEquals(color, new VertexLabelService().get(name, client)
                                                              .getStyle().getColor());
        });
        for (VertexLabel label : List.of(person, team, project)) {
            Assert.assertFalse(label.userdata().containsKey(SchemaService.USER_KEY_STYLE));
        }
    }

    @Test
    public void testBenchPersonUsesMutedDefaultRatherThanOlive() {
        String color = new VertexLabelService().get("bench_person", client(label("bench_person")))
                                               .getStyle().getColor();
        Assert.assertEquals("#967572", color);
    }

    @Test
    public void testSavedBluePreservesEveryCustomField() {
        VertexLabel person = label("Person");
        VertexLabelStyle saved = new VertexLabelStyle(
                "person-icon", "#5C73E6", VertexLabelStyle.Size.BIG,
                List.of("name", "community"), List.of(" / "));
        String raw = JsonUtil.toJson(saved);
        person.userdata().put(SchemaService.USER_KEY_STYLE, raw);
        Map<String, Object> before = new HashMap<>(person.userdata());

        VertexLabelStyle result = new VertexLabelService().get("Person", client(person))
                                                         .getStyle();

        Assert.assertEquals(saved.getIcon(), result.getIcon());
        Assert.assertEquals(saved.getColor(), result.getColor());
        Assert.assertEquals(saved.getSize(), result.getSize());
        Assert.assertEquals(saved.getDisplayFields(), result.getDisplayFields());
        Assert.assertEquals(saved.getJoinSymbols(), result.getJoinSymbols());
        Assert.assertEquals(before, person.userdata());
    }

    @Test
    public void testPartialSavedStylesKeepTheirExistingDefaults() {
        for (String raw : List.of("{\"color\":\"#5C73E6\"}", "{\"size\":\"BIG\"}", "{}")) {
            VertexLabel person = label("Person");
            person.userdata().put(SchemaService.USER_KEY_STYLE, raw);

            VertexLabelStyle result = new VertexLabelService().get("Person", client(person))
                                                             .getStyle();

            Assert.assertEquals("#5C73E6", result.getColor());
            Assert.assertEquals(raw.contains("BIG") ? VertexLabelStyle.Size.BIG :
                                VertexLabelStyle.Size.NORMAL, result.getSize());
            Assert.assertEquals(List.of("~id"), result.getDisplayFields());
            Assert.assertEquals(List.of("-"), result.getJoinSymbols());
            Assert.assertEquals(raw, person.userdata().get(SchemaService.USER_KEY_STYLE));
        }
    }

    @Test
    public void testDefaultPaletteAvoidsSavedBlueAndRetainsStrokeContrast() {
        HashSet<String> colors = new HashSet<>();
        for (int slot = 0; slot < 12; slot++) {
            String name;
            int suffix = 0;
            do {
                name = "palette_" + suffix++;
            } while (Math.floorMod(name.hashCode(), 12) != slot);
            String color = new VertexLabelService().get(name, client(label(name)))
                                                  .getStyle().getColor();
            colors.add(color);
            Assert.assertNotEquals(new VertexLabelStyle().getColor(), color);
            double[] rgb = rgb(color);
            double luminance = 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) +
                               0.0722 * linear(rgb[2]);
            Assert.assertTrue("Low stroke contrast for " + color,
                              1.05 / (luminance + 0.05) >= 3.0);
        }
        Assert.assertEquals(12, colors.size());
    }

    @Test
    public void testReviewedLabelsRemainDistinctWithTranslucentFills() {
        HugeClient client = client(label("person"), label("movie"), label("vertex"));
        VertexLabelService service = new VertexLabelService();
        String person = service.get("person", client).getStyle().getColor();
        String movie = service.get("movie", client).getStyle().getColor();
        String vertex = service.get("vertex", client).getStyle().getColor();

        Assert.assertTrue("person and movie fills are too similar",
                          fillDistance(person, movie) > 0.06);
        Assert.assertTrue("Unstyled vertex fill resembles saved/default blue",
                          fillDistance(vertex, new VertexLabelStyle().getColor()) > 0.06);
    }

    private static double[] rgb(String color) {
        return new double[]{Integer.parseInt(color.substring(1, 3), 16) / 255.0,
                            Integer.parseInt(color.substring(3, 5), 16) / 255.0,
                            Integer.parseInt(color.substring(5, 7), 16) / 255.0};
    }

    private static double linear(double channel) {
        return channel <= 0.04045 ? channel / 12.92 :
               Math.pow((channel + 0.055) / 1.055, 2.4);
    }

    private static double[] fillLab(String color) {
        double[] rgb = rgb(color);
        // Compare the actual default 0.4-opacity node fills on a white canvas.
        double r = linear(0.6 + 0.4 * rgb[0]);
        double g = linear(0.6 + 0.4 * rgb[1]);
        double b = linear(0.6 + 0.4 * rgb[2]);
        double l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
        double m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
        double s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
        // Oklab keeps this regression about visible separation, not exact hex choices.
        return new double[]{0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
                            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
                            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s};
    }

    private static double fillDistance(String first, String second) {
        double[] a = fillLab(first);
        double[] b = fillLab(second);
        return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) +
                         Math.pow(a[2] - b[2], 2));
    }

    private static VertexLabel label(String name) {
        VertexLabel label = new VertexLabel.BuilderImpl(name, null)
                                          .enableLabelIndex(true).build();
        label.userdata().put(SchemaService.USER_KEY_CREATE_TIME, 0L);
        return label;
    }

    private static HugeClient client(VertexLabel... labels) {
        SchemaManager schema = Mockito.mock(SchemaManager.class);
        HugeClient client = Mockito.mock(HugeClient.class);
        Mockito.when(client.schema()).thenReturn(schema);
        Mockito.when(schema.getIndexLabels()).thenReturn(Collections.emptyList());
        for (VertexLabel label : labels) {
            Mockito.when(schema.getVertexLabel(label.name())).thenReturn(label);
        }
        return client;
    }

    private static Map<String, String> colors(List<VertexLabelEntity> labels) {
        return labels.stream().collect(Collectors.toMap(
                VertexLabelEntity::getName, label -> label.getStyle().getColor()));
    }
}
