use soroban_sdk::{Address, String};
use crate::error::LumentixError;

/// Validate that an address is not invalid
/// In Soroban, addresses are validated by the SDK, but we keep this for consistency
pub fn validate_address(_address: &Address) -> Result<(), LumentixError> {
    // Soroban SDK ensures addresses are valid
    // This function exists for future custom validation if needed
    Ok(())
}

/// Validate that an amount is positive (greater than 0)
pub fn validate_positive_amount(amount: i128) -> Result<(), LumentixError> {
    if amount <= 0 {
        return Err(LumentixError::InvalidAmount);
    }
    Ok(())
}

/// Validate that capacity is positive (greater than 0)
pub fn validate_positive_capacity(capacity: u32) -> Result<(), LumentixError> {
    if capacity == 0 {
        return Err(LumentixError::CapacityExceeded);
    }
    Ok(())
}

/// Validate that start time is before end time
pub fn validate_time_range(start_time: u64, end_time: u64) -> Result<(), LumentixError> {
    if start_time >= end_time {
        return Err(LumentixError::InvalidTimeRange);
    }
    Ok(())
}

/// Validate that a string is not empty
pub fn validate_string_not_empty(s: &String) -> Result<(), LumentixError> {
    if s.len() == 0 {
        return Err(LumentixError::EmptyString);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{Env, String};

    #[test]
    fn test_validate_positive_amount() {
        assert!(validate_positive_amount(100).is_ok());
        assert!(validate_positive_amount(1).is_ok());
        assert_eq!(
            validate_positive_amount(0),
            Err(LumentixError::InvalidAmount)
        );
        assert_eq!(
            validate_positive_amount(-1),
            Err(LumentixError::InvalidAmount)
        );
    }

    #[test]
    fn test_validate_positive_capacity() {
        assert!(validate_positive_capacity(100).is_ok());
        assert!(validate_positive_capacity(1).is_ok());
        assert_eq!(
            validate_positive_capacity(0),
            Err(LumentixError::CapacityExceeded)
        );
    }

    #[test]
    fn test_validate_time_range() {
        assert!(validate_time_range(100, 200).is_ok());
        assert!(validate_time_range(0, 1).is_ok());
        assert_eq!(
            validate_time_range(200, 100),
            Err(LumentixError::InvalidTimeRange)
        );
        assert_eq!(
            validate_time_range(100, 100),
            Err(LumentixError::InvalidTimeRange)
        );
    }

    #[test]
    fn test_validate_string_not_empty() {
        let env = Env::default();
        let valid_string = String::from_str(&env, "test");
        let empty_string = String::from_str(&env, "");
        
        assert!(validate_string_not_empty(&valid_string).is_ok());
        assert_eq!(
            validate_string_not_empty(&empty_string),
            Err(LumentixError::EmptyString)
        );
    }
}
