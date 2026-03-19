import api from "@/services/axios";
import { User } from "@/hooks/use-user";

export const userApi = {
  /**
   * Get current authenticated user details
   */
  getCurrentUser: async (): Promise<User> => {
    const response = await api.get("/users/me");
    return response.data;
  },
};
