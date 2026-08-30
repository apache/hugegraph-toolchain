package org.apache.hugegraph.unit;

import java.util.List;

import org.apache.hugegraph.util.JsonUtil;
import org.junit.Assert;
import org.junit.Test;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

public class JsonUtilTest {

    private static Cat Tom = new Cat("Tom", 3);
    private static Cat Butch = new Cat("Butch", 5);

    private static String TOM_JSON = "{\"name\":\"Tom\",\"age\":3}";
    private static String BUTCH_JSON = "{\"name\":\"Butch\",\"age\":5}";

    private static String JSON_LIST = "[" + TOM_JSON + ", " + BUTCH_JSON + "]";

    @Test
    public void testToJson() {
        Assert.assertEquals(TOM_JSON, JsonUtil.toJson(Tom));
    }

    @Test
    public void testFromJson() {
        Assert.assertEquals(Tom, JsonUtil.fromJson(TOM_JSON, Cat.class));
    }

    @Test
    public void testConvertValue() throws JsonProcessingException {
        ObjectMapper objectMapper = new ObjectMapper();
        JsonNode jsonNode = objectMapper.readTree(TOM_JSON);
        Assert.assertEquals(Tom, JsonUtil.convertValue(jsonNode, Cat.class));
    }

    @Test
    public void testFromJson2List() {
        List<Cat> cats = JsonUtil.fromJson2List(JSON_LIST, Cat.class);
        Assert.assertEquals(2, cats.size());
        Assert.assertEquals(Tom, cats.get(0));
        Assert.assertEquals(Butch, cats.get(1));
    }

    static class Cat {

        private String name;
        private Integer age;

        public Cat() {
        }

        public Cat(String name, Integer age) {
            this.name = name;
            this.age = age;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public Integer getAge() {
            return age;
        }

        public void setAge(Integer age) {
            this.age = age;
        }

        @Override
        public boolean equals(Object obj) {
            return obj instanceof Cat &&
                   this.name.equals(((Cat) obj).getName()) &&
                   this.age == ((Cat) obj).getAge();
        }
    }
}
