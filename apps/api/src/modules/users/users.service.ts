import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

type Role = 'ADMIN' | 'CASHIER' | 'STOCKER';

/**
 * 账号管理服务。规则:
 *   - 密码只加密存 passwordHash,永远不返回明文。
 *   - list / findOne / create / update 全部不返回 passwordHash 字段(select 白名单)。
 *   - 不做删除,只做软删(isActive=false)。收银台/移动端登录时看 isActive,禁用即拒登。
 *     真删了会破坏历史订单/入库记录里的 operator/cashier 外键关系。
 *   - "改自己"接口用来老板/员工自助改密;需要旧密码验证。
 *   - "重置密码"接口是管理员发新初始密码给员工用的,不需要旧密码。
 *   - 管理员防呆:不能禁用自己、不能把自己的角色改成非 ADMIN、不能删除最后一个 ADMIN。
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // select 白名单,统一从这里拿,避免哪一处漏掉把 hash 返给前端
  private readonly safeSelect = {
    id: true,
    username: true,
    displayName: true,
    role: true,
    isActive: true,
    createdAt: true,
  } as const;

  list() {
    return this.prisma.user.findMany({
      select: this.safeSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: this.safeSelect,
    });
    if (!u) throw new NotFoundException('用户不存在');
    return u;
  }

  async create(data: {
    username: string;
    displayName: string;
    password: string;
    role?: Role;
  }) {
    const dup = await this.prisma.user.findUnique({
      where: { username: data.username },
      select: { id: true },
    });
    if (dup) throw new BadRequestException(`用户名 ${data.username} 已存在`);
    if (data.password.length < 6) {
      throw new BadRequestException('密码至少 6 位');
    }

    const hash = await bcrypt.hash(data.password, 10);
    return this.prisma.user.create({
      data: {
        username: data.username.trim(),
        displayName: data.displayName.trim() || data.username.trim(),
        passwordHash: hash,
        role: data.role ?? 'CASHIER',
      },
      select: this.safeSelect,
    });
  }

  async update(
    id: string,
    currentUserId: string,
    data: { displayName?: string; role?: Role; isActive?: boolean },
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundException('用户不存在');

    // 自我保护:改自己不能把自己降权或禁用,不然会把自己反锁在外面
    if (id === currentUserId) {
      if (data.role && data.role !== 'ADMIN') {
        throw new BadRequestException('不能把自己的角色降级为非管理员');
      }
      if (data.isActive === false) {
        throw new BadRequestException('不能禁用自己');
      }
    }

    // 别把最后一个 ADMIN 降级/禁用,防止没人能进后台
    const willLoseAdmin =
      target.role === 'ADMIN' &&
      ((data.role && data.role !== 'ADMIN') || data.isActive === false);
    if (willLoseAdmin) {
      const remainingAdmins = await this.prisma.user.count({
        where: { role: 'ADMIN', isActive: true, NOT: { id } },
      });
      if (remainingAdmins === 0) {
        throw new BadRequestException(
          '这是最后一个管理员,不能降级或禁用。请先另建管理员账号。',
        );
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(data.displayName !== undefined && {
          displayName: data.displayName.trim(),
        }),
        ...(data.role !== undefined && { role: data.role }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      select: this.safeSelect,
    });
  }

  /** 管理员给别人重置初始密码(不需要旧密码)。返回不含 hash。 */
  async resetPassword(id: string, newPassword: string) {
    if (newPassword.length < 6) {
      throw new BadRequestException('新密码至少 6 位');
    }
    const hash = await bcrypt.hash(newPassword, 10);
    return this.prisma.user
      .update({
        where: { id },
        data: { passwordHash: hash },
        select: this.safeSelect,
      })
      .catch(() => {
        throw new NotFoundException('用户不存在');
      });
  }

  /** 自己改自己的密码,需要旧密码验证。 */
  async changeOwnPassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ) {
    if (newPassword.length < 6) {
      throw new BadRequestException('新密码至少 6 位');
    }
    if (oldPassword === newPassword) {
      throw new BadRequestException('新密码不能和旧密码一样');
    }
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException('用户不存在');
    const ok = await bcrypt.compare(oldPassword, u.passwordHash);
    if (!ok) throw new UnauthorizedException('旧密码不对');

    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash },
    });
    return { ok: true };
  }
}
