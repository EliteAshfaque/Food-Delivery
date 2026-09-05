import { useAuth } from "@/context/auth-context";
import { Redirect } from "expo-router";
import { UserRole } from "@food-delivery/types";

export default function IndexScreen() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;

  if (!user) return <Redirect href="/login" />;

  if (user.role === UserRole.CUSTOMER)
    return <Redirect href="/(customer)/(index)" />;
  if (user.role === UserRole.RESTAURANT_OWNER)
    return <Redirect href="/(owner)/(index)" />;
  if (user.role === UserRole.DRIVER) return <Redirect href="/(driver)" />;
  if (user.role === UserRole.ADMIN) return <Redirect href="/(admin)" />;

  return <Redirect href="/login" />;
}
