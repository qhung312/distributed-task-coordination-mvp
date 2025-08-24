import { Controller, Delete, Param, Post } from '@nestjs/common';
import { TaskService } from './coordination/services';

@Controller()
export class AppController {
  constructor(private taskService: TaskService) {}

  @Post('tasks/:id')
  async createTask(@Param('id') id: string) {
    return this.taskService.addTask(id, { data: 'Sample Task Data' });
  }

  @Delete('tasks/:id')
  async deleteTask(@Param('id') id: string) {
    return this.taskService.removeTask(id);
  }
}
