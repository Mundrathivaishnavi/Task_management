import { useRoute, Link } from "wouter";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useGetTask,
  useUpdateTask,
  useDeleteTask,
  useListUsers,
  getGetTaskQueryKey,
  getListTasksQueryKey,
  getGetDashboardStatsQueryKey,
  getGetRecentTasksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Clock, User, FolderOpen, Trash2, Edit, Save, X, AlertCircle } from "lucide-react";
import { format, isPast } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const editTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.enum(["pending", "in_progress", "completed"]),
  assignedUserId: z.string().optional(),
});

const statusUpdateSchema = z.object({
  status: z.enum(["pending", "in_progress", "completed"]),
});

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">Completed</Badge>;
  if (status === "in_progress") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200">In Progress</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

export default function TaskDetailPage() {
  const [, params] = useRoute("/tasks/:id");
  const taskId = params?.id ?? "";
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);

  const { data: task, isLoading } = useGetTask(taskId, {
    query: { enabled: !!taskId, queryKey: getGetTaskQueryKey(taskId) },
  });
  const { data: allUsers } = useListUsers();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const editForm = useForm<z.infer<typeof editTaskSchema>>({
    resolver: zodResolver(editTaskSchema),
    values: task ? {
      title: task.title,
      description: task.description ?? "",
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
      status: task.status as "pending" | "in_progress" | "completed",
      assignedUserId: task.assignedUserId ?? "",
    } : undefined,
  });

  const statusForm = useForm<z.infer<typeof statusUpdateSchema>>({
    resolver: zodResolver(statusUpdateSchema),
    values: task ? { status: task.status as "pending" | "in_progress" | "completed" } : undefined,
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(taskId) });
    queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecentTasksQueryKey() });
  }

  function onSaveEdit(values: z.infer<typeof editTaskSchema>) {
    updateTask.mutate(
      {
        taskId,
        data: {
          title: values.title,
          description: values.description,
          dueDate: values.dueDate || undefined,
          status: values.status,
          assignedUserId: values.assignedUserId || undefined,
        },
      },
      {
        onSuccess: () => {
          invalidateAll();
          toast({ title: "Task updated" });
          setIsEditing(false);
        },
      }
    );
  }

  function onStatusUpdate(values: z.infer<typeof statusUpdateSchema>) {
    updateTask.mutate(
      { taskId, data: { status: values.status } },
      {
        onSuccess: () => {
          invalidateAll();
          toast({ title: "Status updated" });
        },
      }
    );
  }

  function handleDelete() {
    deleteTask.mutate(
      { taskId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          toast({ title: "Task deleted" });
          setLocation("/tasks");
        },
      }
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Task not found.</p>
        <Link href="/tasks">
          <Button variant="link" className="mt-2">Back to Tasks</Button>
        </Link>
      </div>
    );
  }

  const isOverdue = task.dueDate && isPast(new Date(task.dueDate)) && task.status !== "completed";

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <Link href="/tasks" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Tasks
        </Link>
        {task.project && (
          <>
            <span className="text-muted-foreground">/</span>
            <Link href={`/projects/${task.project.id}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              {task.project.name}
            </Link>
          </>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex-1">
            {!isEditing && (
              <div className="flex items-start gap-3 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight">{task.title}</h1>
                <StatusBadge status={task.status} />
                {isOverdue && (
                  <span className="flex items-center gap-1 text-sm text-red-500 font-medium">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Overdue
                  </span>
                )}
              </div>
            )}
          </div>
          {user?.role === "admin" && !isEditing && (
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Edit className="w-3.5 h-3.5 mr-1.5" />
                Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Task</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete "{task.title}". This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete Task
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </CardHeader>

        <CardContent>
          {isEditing && user?.role === "admin" ? (
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onSaveEdit)} className="space-y-4">
                <FormField
                  control={editForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl><Textarea {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="dueDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Deadline</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={editForm.control}
                  name="assignedUserId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assigned To</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {allUsers?.map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => { setIsEditing(false); editForm.reset(); }}>
                    <X className="w-4 h-4 mr-1.5" />
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateTask.isPending}>
                    <Save className="w-4 h-4 mr-1.5" />
                    {updateTask.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </Form>
          ) : (
            <div className="space-y-5">
              {task.description && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Description</p>
                  <p className="text-sm leading-relaxed">{task.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground flex items-center gap-1.5">
                    <FolderOpen className="w-3.5 h-3.5" />
                    Project
                  </p>
                  {task.project ? (
                    <Link href={`/projects/${task.project.id}`} className="font-medium hover:text-primary transition-colors">
                      {task.project.name}
                    </Link>
                  ) : (
                    <p className="font-medium text-muted-foreground">Unknown</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    Assigned To
                  </p>
                  <p className="font-medium">
                    {task.assignedUser?.name ?? "Unassigned"}
                  </p>
                </div>
                {task.dueDate && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Deadline
                    </p>
                    <p className={`font-medium ${isOverdue ? "text-red-500" : ""}`}>
                      {format(new Date(task.dueDate), "MMMM d, yyyy")}
                    </p>
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-muted-foreground">Last Updated</p>
                  <p className="font-medium">{format(new Date(task.updatedAt), "MMM d, yyyy")}</p>
                </div>
              </div>

              <div className="pt-2 border-t">
                <p className="text-sm font-medium mb-3">Update Status</p>
                <Form {...statusForm}>
                  <form onSubmit={statusForm.handleSubmit(onStatusUpdate)} className="flex items-end gap-3">
                    <FormField
                      control={statusForm.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <Button type="submit" disabled={updateTask.isPending}>
                      {updateTask.isPending ? "Saving..." : "Update"}
                    </Button>
                  </form>
                </Form>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
