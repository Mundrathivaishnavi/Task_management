import { Router, type IRouter } from "express";
import mongoose from "mongoose";
import { Task, User, Project, ITask, IUser, IProject } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import {
  CreateTaskBody,
  UpdateTaskBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function isValidId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

interface UserDoc { _id: mongoose.Types.ObjectId; name: string; email: string; role: string; createdAt: Date }
interface ProjectDoc { _id: mongoose.Types.ObjectId; name: string; description?: string | null; createdById: mongoose.Types.ObjectId; memberIds: mongoose.Types.ObjectId[]; createdAt: Date }

function formatUser(u: UserDoc) {
  return {
    id: u._id.toString(),
    name: u.name,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
  };
}

function formatTask(
  t: ITask & { _id: mongoose.Types.ObjectId; createdAt: Date; updatedAt: Date },
  assignedUser: UserDoc | null,
  project: ProjectDoc | null,
  memberCount: number,
  taskCount: number,
) {
  return {
    id: t._id.toString(),
    title: t.title,
    description: t.description ?? null,
    dueDate: t.dueDate ? (t.dueDate as Date).toISOString() : null,
    status: t.status,
    projectId: t.projectId.toString(),
    assignedUserId: t.assignedUserId?.toString() ?? null,
    assignedUser: assignedUser ? formatUser(assignedUser) : null,
    project: project ? {
      id: project._id.toString(),
      name: project.name,
      description: project.description ?? null,
      createdById: project.createdById.toString(),
      memberCount,
      taskCount,
      createdAt: project.createdAt.toISOString(),
    } : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

router.get("/tasks", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const role = req.user!.role;

  const filter: Record<string, unknown> = {};
  const qProjectId = req.query.projectId as string | undefined;
  const qAssignedUserId = req.query.assignedUserId as string | undefined;
  if (qProjectId && isValidId(qProjectId)) filter.projectId = new mongoose.Types.ObjectId(qProjectId);
  if (qAssignedUserId && isValidId(qAssignedUserId)) filter.assignedUserId = new mongoose.Types.ObjectId(qAssignedUserId);
  if (req.query.status) filter.status = req.query.status;

  if (role !== "admin") {
    const memberProjects = await Project.find(
      { memberIds: new mongoose.Types.ObjectId(userId) },
      { _id: 1 }
    ).lean();
    const memberProjectIds = memberProjects.map(p => p._id);
    filter.projectId = { $in: memberProjectIds };
  }

  const tasks = await Task.find(filter).sort({ createdAt: 1 }).lean();

  const assignedUserIds = tasks
    .map(t => t.assignedUserId)
    .filter((id): id is mongoose.Types.ObjectId => id != null);
  const projectIds = [...new Set(tasks.map(t => t.projectId.toString()))].map(
    id => new mongoose.Types.ObjectId(id)
  );

  const [users, projects, taskCountAgg] = await Promise.all([
    assignedUserIds.length > 0 ? User.find({ _id: { $in: assignedUserIds } }).lean() : [],
    projectIds.length > 0 ? Project.find({ _id: { $in: projectIds } }).lean() : [],
    projectIds.length > 0
      ? Task.aggregate([
          { $match: { projectId: { $in: projectIds } } },
          { $group: { _id: "$projectId", count: { $sum: 1 } } },
        ])
      : [],
  ]);

  const userMap = Object.fromEntries(users.map(u => [u._id.toString(), u]));
  const projectMap = Object.fromEntries(projects.map(p => [p._id.toString(), p]));
  const taskCountMap = Object.fromEntries(taskCountAgg.map((r: { _id: mongoose.Types.ObjectId; count: number }) => [r._id.toString(), r.count]));

  res.json(tasks.map(t => {
    const proj = projectMap[t.projectId.toString()] ?? null;
    return formatTask(
      t as ITask & { _id: mongoose.Types.ObjectId; createdAt: Date; updatedAt: Date },
      t.assignedUserId ? (userMap[t.assignedUserId.toString()] as UserDoc ?? null) : null,
      proj as ProjectDoc | null,
      proj ? (proj as ProjectDoc).memberIds.length : 0,
      taskCountMap[t.projectId.toString()] ?? 0,
    );
  }));
});

router.post("/tasks", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, description, dueDate, projectId, assignedUserId } = parsed.data;

  if (!isValidId(projectId)) {
    res.status(400).json({ error: "Invalid projectId" });
    return;
  }

  const project = await Project.findById(projectId).lean();
  if (!project) {
    res.status(400).json({ error: "Project not found" });
    return;
  }

  const task = await Task.create({
    title,
    description: description ?? null,
    dueDate: dueDate ? new Date(dueDate) : null,
    projectId: new mongoose.Types.ObjectId(projectId),
    assignedUserId: assignedUserId ? new mongoose.Types.ObjectId(assignedUserId) : null,
    status: "pending",
  });

  const [assignedUser, taskCount] = await Promise.all([
    assignedUserId ? User.findById(assignedUserId).lean() : null,
    Task.countDocuments({ projectId: new mongoose.Types.ObjectId(projectId) }),
  ]);

  res.status(201).json(formatTask(
    task.toObject() as ITask & { _id: mongoose.Types.ObjectId; createdAt: Date; updatedAt: Date },
    assignedUser as UserDoc | null,
    project as ProjectDoc,
    (project as ProjectDoc).memberIds.length,
    taskCount,
  ));
});

router.get("/tasks/:taskId", requireAuth, async (req, res): Promise<void> => {
  const { taskId } = req.params;
  if (!isValidId(taskId)) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const task = await Task.findById(taskId).lean();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const [project, assignedUser, taskCount] = await Promise.all([
    Project.findById(task.projectId).lean(),
    task.assignedUserId ? User.findById(task.assignedUserId).lean() : null,
    Task.countDocuments({ projectId: task.projectId }),
  ]);

  res.json(formatTask(
    task as ITask & { _id: mongoose.Types.ObjectId; createdAt: Date; updatedAt: Date },
    assignedUser as UserDoc | null,
    project as ProjectDoc | null,
    project ? (project as ProjectDoc).memberIds.length : 0,
    taskCount,
  ));
});

router.patch("/tasks/:taskId", requireAuth, async (req, res): Promise<void> => {
  const { taskId } = req.params;
  if (!isValidId(taskId)) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existingTask = await Task.findById(taskId).lean();
  if (!existingTask) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  if (req.user!.role !== "admin") {
    if (existingTask.assignedUserId?.toString() !== req.user!.userId) {
      res.status(403).json({ error: "You can only update tasks assigned to you" });
      return;
    }
    const allowedFields = Object.keys(parsed.data);
    if (allowedFields.some(k => k !== "status")) {
      res.status(403).json({ error: "Members can only update task status" });
      return;
    }
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.dueDate !== undefined) updates.dueDate = new Date(parsed.data.dueDate);
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.assignedUserId !== undefined) {
    updates.assignedUserId = parsed.data.assignedUserId
      ? new mongoose.Types.ObjectId(parsed.data.assignedUserId)
      : null;
  }

  const task = await Task.findByIdAndUpdate(taskId, updates, { new: true }).lean();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const [project, assignedUser, taskCount] = await Promise.all([
    Project.findById(task.projectId).lean(),
    task.assignedUserId ? User.findById(task.assignedUserId).lean() : null,
    Task.countDocuments({ projectId: task.projectId }),
  ]);

  res.json(formatTask(
    task as ITask & { _id: mongoose.Types.ObjectId; createdAt: Date; updatedAt: Date },
    assignedUser as UserDoc | null,
    project as ProjectDoc | null,
    project ? (project as ProjectDoc).memberIds.length : 0,
    taskCount,
  ));
});

router.delete("/tasks/:taskId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { taskId } = req.params;
  if (!isValidId(taskId)) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const task = await Task.findByIdAndDelete(taskId);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
