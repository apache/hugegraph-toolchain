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

package org.apache.hugegraph.util;

import java.util.Map;
import java.util.Scanner;

import org.apache.hugegraph.base.Printer;
import org.apache.hugegraph.constant.Constants;
import org.apache.hugegraph.exception.ExitException;

import com.beust.jcommander.JCommander;

public final class ToolUtil {

    public static void printOrThrow(Throwable e, boolean throwMode) {
        Printer.print("Failed to execute %s", e.getMessage());
        if (throwMode) {
            if (e instanceof RuntimeException runtimeException) {
                throw runtimeException;
            }
            throw new RuntimeException(e);
        }
        printExceptionStackIfNeeded(e);
    }

    public static void printExceptionStackIfNeeded(Throwable e) {
        System.out.println("Type y(yes) to print exception stack[default n]?");
        Scanner scan = new Scanner(System.in);
        // No line to read when stdin is closed or empty, keep the default
        String inputInfomation = scan.hasNextLine() ? scan.nextLine() : "";

        if (inputInfomation.equalsIgnoreCase(Constants.INPUT_YES) ||
            inputInfomation.equalsIgnoreCase(Constants.INPUT_Y)) {
            e.printStackTrace();
        }
    }

    public static void exitOrThrow(ExitException e, boolean throwMode) {
        if (throwMode) {
            throw e;
        }

        if (e.exitCode() != Constants.EXIT_CODE_NORMAL) {
            Printer.print(e.getMessage());
        }
        Printer.print(e.details());
    }

    public static String commandsCategory(JCommander jCommander) {
        StringBuilder sb = new StringBuilder();
        sb.append("================================================");
        sb.append("\n");
        sb.append("Warning : must provide one sub-command");
        sb.append("\n");
        sb.append("================================================");
        sb.append("\n");
        sb.append("Here are some sub-command :");
        sb.append("\n");
        Map<String, JCommander> subCommandes = jCommander.getCommands();
        for (String subCommand : subCommandes.keySet()) {
            sb.append("|");
            sb.append(subCommand);
            sb.append("\n");
        }
        sb.append("================================================");
        sb.append("\n");
        sb.append("Please use 'hugegraph help' to get detail help info " +
                  "of all sub-commands or 'hugegraph help {sub-command}' " +
                  "to get detail help info of one sub-command");
        sb.append("\n");
        sb.append("================================================");

        return sb.toString();
    }

    public static String commandUsage(JCommander jCommander) {
        StringBuilder sb = new StringBuilder();
        jCommander.usage(sb);

        return sb.toString();
    }
}
