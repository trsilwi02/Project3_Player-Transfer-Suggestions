import { NextRequest, NextResponse } from 'next/server';
import { ShortlistService } from '@/services/shortlist.service';
import { errorResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUser(request);
    if (!user) {
      return errorResponse('UNAUTHORIZED', 'Vui lòng đăng nhập để xuất danh sách', 401);
    }

    const { searchParams } = new URL(request.url);
    const reqIdParam = searchParams.get('requirementId');
    const reqId = reqIdParam ? parseInt(reqIdParam, 10) : undefined;

    const csvContent = await ShortlistService.exportToCsv(user.id, isNaN(reqId!) ? undefined : reqId);

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="shortlist_export_${Date.now()}.csv"`,
      },
    });
  } catch (err: any) {
    return errorResponse('EXPORT_FAILED', err.message, 500);
  }
}
