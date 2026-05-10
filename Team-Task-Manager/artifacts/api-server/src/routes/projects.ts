import { Router, type IRouter } from "express";
import mongoose from "mongoose";
import { Project, User, Task } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import {
  CreateProjectBody,
  UpdateProjectBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function isValidId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

router.get("/projects", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const role = req.user!.role;

  let projects;
  if (role === "admin") {
    projects = await Project.find({}).sort({ createdAt: 1 }).lean();
  } else {
    projects = await Project.find({ memberIds: new mongoose.Types.ObjectId(userId) })
      .sort({ createdAt: 1 })
      .lean();
  }

  const projectIds = projects.map(p => p._id);

  const taskCounts = await Task.aggregate([
    { $match: { projectId: { $in: projectIds } } },
    { $group: { _id: "$projectId", count: { $sum: 1 } } },
  ]);
  const taskCountMap = Object.fromEntries(taskCounts.map(r => [r._id.toString(), r.count]));

  res.json(projects.map(p => ({
    id: p._id.toString(),
    name: p.name,
    description: p.description ?? null,
    createdById: p.createdById.toString(),
    memberCount: p.memberIds.length,
    taskCount: taskCountMap[p._id.toString()] ?? 0,
    createdAt: (p.createdAt as Date).toISOString(),
  })));
});

router.post("/projects", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const creatorId = new mongoose.Types.ObjectId(req.user!.userId);
  const project = await Project.create({
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    createdById: creatorId,
    memberIds: [creatorId],
  });

  res.status(201).json({
    id: project._id.toString(),
    name: project.name,
    description: project.description ?? null,
    createdById: project.createdById.toString(),
    memberCount: 1,
    taskCount: 0,
    createdAt: project.createdAt.toISOString(),
  });
});

router.get("/projects/:projectId", requireAuth, async (req, res): Promise<void> => {
  const { projectId } = req.params;
  if (!isValidId(projectId)) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const project = await Project.findById(projectId).lean();
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const members = await User.find({ _id: { $in: project.memberIds } })
    .sort({ name: 1 })
    .lean();

  const tasks = await Task.find({ projectId: project._id })
    .sort({ createdAt: 1 })
    .lean();

  const assignedUserIds = tasks
    .map(t => t.assignedUserId)
    .filter((id): id is mongoose.Types.ObjectId => id != null);

  const assignedUsers = assignedUserIds.length > 0
    ? await User.find({ _id: { $in: assignedUserIds } }).lean()
    : [];
  const userMap = Object.fromEntries(assignedUsers.map(u => [u._id.toString(), u]));

  const projectData = {
    id: project._id.toString(),
    name: project.name,
    description: project.description ?? null,
    createdById: project.createdById.toString(),
    createdAt: (project.createdAt as Date).toISOString(),
  };

  res.json({
    ...projectData,
    members: members.map(m => ({
      id: m._id.toString(),
      name: m.name,
      email: m.email,
      role: m.role,
      createdAt: (m.createdAt as Date).toISOString(),
    })),
    tasks: tasks.map(t => {
      const au = t.assignedUserId ? userMap[t.assignedUserId.toString()] : null;
      return {
        id: t._id.toString(),
        title: t.title,
        description: t.description ?? null,
        dueDate: t.dueDate ? (t.dueDate as Date).toISOString() : null,
        status: t.status,
        projectId: t.projectId.toString(),
        assignedUserId: t.assignedUserId?.toString() ?? null,
        assignedUser: au ? {
          id: au._id.toString(),
          name: au.name,
          email: au.email,
          role: au.role,
          createdAt: (au.createdAt as Date).toISOString(),
        } : null,
        project: projectData,
        createdAt: (t.createdAt as Date).toISOString(),
        updatedAt: (t.updatedAt as Date).toISOString(),
      };
    }),
  });
});

router.patch("/projects/:projectId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { projectId } = req.params;
  if (!isValidId(projectId)) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;

  const project = await Project.findByIdAndUpdate(projectId, updates, { new: true }).lean();
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const taskCount = await Task.countDocuments({ projectId: project._id });

  res.json({
    id: project._id.toString(),
    name: project.name,
    description: project.description ?? null,
    createdById: project.createdById.toString(),
    memberCount: project.memberIds.length,
    taskCount,
    createdAt: (project.createdAt as Date).toISOString(),
  });
});

router.delete("/projects/:projectId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { projectId } = req.params;
  if (!isValidId(projectId)) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const project = await Project.findByIdAndDelete(projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  await Task.deleteMany({ projectId: new mongoose.Types.ObjectId(projectId) });

  res.sendStatus(204);
});

router.post("/projects/:projectId/members", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { projectId } = req.params;
  if (!isValidId(projectId)) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const { userId } = req.body;
  if (!userId || !isValidId(userId)) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }

  const user = await User.findById(userId).lean();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await Project.findByIdAndUpdate(
    projectId,
    { $addToSet: { memberIds: new mongoose.Types.ObjectId(userId) } }
  );

  res.status(201).json({
    projectId,
    userId,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: (user.createdAt as Date).toISOString(),
    },
  });
});

router.delete("/projects/:projectId/members/:userId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { projectId, userId } = req.params;
  if (!isValidId(projectId) || !isValidId(userId)) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await Project.findByIdAndUpdate(
    projectId,
    { $pull: { memberIds: new mongoose.Types.ObjectId(userId) } }
  );

  res.sendStatus(204);
});

export default router;
