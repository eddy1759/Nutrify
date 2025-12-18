import { HttpException, HttpStatus } from '@nestjs/common';

export class OcrProcessingException extends HttpException {
  constructor(message = 'Failed to process image with OCR', cause?: Error) {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'OCR_PROCESSING_FAILED',
        message,
        timestamp: new Date().toISOString(),
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
      { cause },
    );
  }
}

export class MlServiceException extends HttpException {
  constructor(
    message = 'ML classification service unavailable',
    cause?: Error,
  ) {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'ML_SERVICE_UNAVAILABLE',
        message,
        timestamp: new Date().toISOString(),
      },
      HttpStatus.SERVICE_UNAVAILABLE,
      { cause },
    );
  }
}

export class LlmAnalysisException extends HttpException {
  constructor(message = 'LLM analysis failed', cause?: Error) {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'LLM_ANALYSIS_FAILED',
        message,
        timestamp: new Date().toISOString(),
      },
      HttpStatus.SERVICE_UNAVAILABLE,
      { cause },
    );
  }
}

export class InvalidImageException extends HttpException {
  constructor(message = 'Invalid or unreadable image provided') {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'INVALID_IMAGE',
        message,
        timestamp: new Date().toISOString(),
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class InsufficientTextException extends HttpException {
  constructor(message = 'Could not extract sufficient text from image') {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'INSUFFICIENT_TEXT',
        message,
        timestamp: new Date().toISOString(),
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
