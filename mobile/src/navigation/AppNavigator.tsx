import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text } from "react-native";
import { useAuthStore } from "@/store/authStore";

import LoginScreen         from "@/screens/LoginScreen";
import DashboardScreen     from "@/screens/DashboardScreen";
import AnnouncementsScreen from "@/screens/AnnouncementsScreen";
import DocumentsScreen     from "@/screens/DocumentsScreen";
import DuesScreen          from "@/screens/DuesScreen";

export type RootStackParams = {
  Login: undefined;
  Main:  undefined;
};

export type MainTabParams = {
  Dashboard:     undefined;
  Announcements: undefined;
  Documents:     undefined;
  Dues:          undefined;
};

const Stack = createNativeStackNavigator<RootStackParams>();
const Tab   = createBottomTabNavigator<MainTabParams>();

const INK   = "#0E0E0C";
const PAPER = "#F4F1EB";
const RUST  = "#C94C2E";
const RULE  = "#C8C3B8";
const MONO  = "IBMPlexMono_400Regular";

function tabIcon(label: string, focused: boolean) {
  const icons: Record<string, [string, string]> = {
    Dashboard:     ["⊞", "⊟"],
    Announcements: ["◉", "○"],
    Documents:     ["▤", "▥"],
    Dues:          ["◈", "◇"],
  };
  const [active, inactive] = icons[label] ?? ["•", "·"];
  return (
    <Text style={{ fontSize: 18, color: focused ? RUST : RULE }}>
      {focused ? active : inactive}
    </Text>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown:     false,
        tabBarStyle:     { backgroundColor: PAPER, borderTopColor: RULE, borderTopWidth: 1 },
        tabBarLabelStyle: { fontFamily: MONO, fontSize: 10, letterSpacing: 0.5 },
        tabBarActiveTintColor:   RUST,
        tabBarInactiveTintColor: INK,
        tabBarIcon: ({ focused }) => tabIcon(route.name, focused),
      })}
    >
      <Tab.Screen name="Dashboard"     component={DashboardScreen}     options={{ title: "HOME" }} />
      <Tab.Screen name="Announcements" component={AnnouncementsScreen} options={{ title: "NOTICES" }} />
      <Tab.Screen name="Documents"     component={DocumentsScreen}     options={{ title: "DOCS" }} />
      <Tab.Screen name="Dues"          component={DuesScreen}          options={{ title: "DUES" }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <Stack.Screen name="Main"  component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
