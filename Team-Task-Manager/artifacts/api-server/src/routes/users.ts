import { Router, type IRouter } from "express";
import { User } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/users", requireAuth, async (_req, res): Promise<void> => {
  const users = await User.find({}).sort({ name: 1 }).lean();

  res.json(users.map(u => ({
    id: u._id.toString(),
    name: u.name,
    email: u.email,
    role: u.role,
    createdAt: (u.createdAt as Date).toISOString(),
  })));
});

export default router;
