import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CustomerNotFoundException } from '../../customer/domain/exceptions/customer-not-found.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Let @nestjs/terminus health-check responses pass through unchanged
    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'status' in exceptionResponse &&
        ('info' in exceptionResponse || 'error' in exceptionResponse) &&
        'details' in exceptionResponse
      ) {
        response.status(exception.getStatus()).json(exceptionResponse);
        return;
      }
    }

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: { field: string; constraints: Record<string, string> }[] = [];

    if (exception instanceof CustomerNotFoundException) {
      statusCode = HttpStatus.NOT_FOUND;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp['message'] as string) || exception.message;

        // Handle class-validator errors
        if (Array.isArray(resp['message'])) {
          message = 'Validation failed';
          details = (resp['message'] as string[]).map((msg) => ({
            field: msg.split(' ')[0] || 'unknown',
            constraints: { validation: msg },
          }));
        }
      } else {
        message = String(exceptionResponse);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} - ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} - ${statusCode}: ${message}`,
      );
    }

    response.status(statusCode).json({
      success: false,
      error: {
        statusCode,
        message,
        details,
      },
      timestamp: new Date().toISOString(),
    });
  }
}
