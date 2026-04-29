import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuthRole } from '../common/enums/auth-role.enum';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ListMyNotificationsDto } from './dto/list-my-notifications.dto';
import { NotificationService } from './notification.service';

type RequestWithUser = Request & {
  user: JwtPayload;
};

@ApiTags('Notifications')
@ApiBearerAuth('JWT-auth')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('me')
  @ApiOperation({ summary: 'Lister mes notifications (professionnel de sante)' })
  @ApiResponse({ status: 200, description: 'Notifications du professionnel connecté' })
  listMyNotifications(
    @Req() request: RequestWithUser,
    @Query() query: ListMyNotificationsDto,
  ) {
    if (request.user.role !== AuthRole.HEALTH_PROFESSIONAL) {
      throw new ForbiddenException('Notifications reserved to healthcare professionals');
    }

    return this.notificationService.listForProfessional(request.user.sub, query);
  }

  @Patch(':notificationId/read')
  @ApiOperation({ summary: 'Marquer une notification comme lue' })
  @ApiParam({ name: 'notificationId', example: 'c48f35f8-fb55-4f4d-b0e7-9dd7309027f1' })
  @ApiResponse({ status: 200, description: 'Notification mise à jour' })
  markAsRead(
    @Req() request: RequestWithUser,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    if (request.user.role !== AuthRole.HEALTH_PROFESSIONAL) {
      throw new ForbiddenException('Notifications reserved to healthcare professionals');
    }

    return this.notificationService.markAsRead(notificationId, request.user.sub);
  }

  @Patch('me/read-all')
  @ApiOperation({ summary: 'Marquer toutes mes notifications comme lues' })
  @ApiResponse({ status: 200, description: 'Notifications marquées comme lues' })
  markAllAsRead(@Req() request: RequestWithUser) {
    if (request.user.role !== AuthRole.HEALTH_PROFESSIONAL) {
      throw new ForbiddenException('Notifications reserved to healthcare professionals');
    }

    return this.notificationService.markAllAsRead(request.user.sub);
  }
}
