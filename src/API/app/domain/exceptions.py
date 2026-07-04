class DomainError(Exception):
    """Base domain exception."""


class AuthenticationError(DomainError):
    """Raised when authentication fails."""


class AuthorizationError(DomainError):
    """Raised when a user cannot access a resource."""


class NotFoundError(DomainError):
    """Raised when an entity does not exist."""


class ValidationError(DomainError):
    """Raised when input data is invalid."""
