 import { useAuth } from "@/context/auth-context";
import { Redirect } from "expo-router";
import { UserRole } from "@food-delivery/types";
import { View, Text } from 'react-native'
import React from 'react'

const index = () => { 
   const { user, isLoading } = useAuth();

if (isLoading) return null;

if (!user) return <Redirect href="/login" />;

if (user.role === UserRole.CUSTOMER) return <Redirect href="/(customer)/(index)" />;
if (user.role === UserRole.RESTAURANT_OWNER)
    return <Redirect href="/(owner)" />;
if (user.role === UserRole.DRIVER) return <Redirect href="/(driver)" />;

return <Redirect href="/login" />;
}

export default index