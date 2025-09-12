#!/bin/bash

# Configuration
BASE_URL="http://localhost:3001"
DELAY=1  # Delay between requests in seconds

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print colored headers
print_header() {
    echo -e "\n${CYAN}=================================================="
    echo -e "$1"
    echo -e "==================================================${NC}"
}

# Function to print request info
print_request() {
    echo -e "\n${BLUE}🚀 $1${NC}"
    echo -e "${YELLOW}   $2 $3${NC}"
}

# Function to make a request and show response
make_request() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    print_request "$description" "$method" "$BASE_URL$endpoint"
    
    if [ "$method" = "POST" ] && [ -n "$data" ]; then
        response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
            -X "$method" \
            -H "Content-Type: application/json" \
            -H "User-Agent: Test-Client-Bash/1.0.0" \
            -H "X-Request-ID: test_$(date +%s)_$(openssl rand -hex 4)" \
            -d "$data" \
            "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
            -X "$method" \
            -H "Content-Type: application/json" \
            -H "User-Agent: Test-Client-Bash/1.0.0" \
            -H "X-Request-ID: test_$(date +%s)_$(openssl rand -hex 4)" \
            "$BASE_URL$endpoint")
    fi
    
    # Extract HTTP status and body
    http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_STATUS:/d')
    
    # Print status with color
    if [ "$http_status" -ge 200 ] && [ "$http_status" -lt 300 ]; then
        echo -e "   ${GREEN}✅ Status: $http_status${NC}"
    elif [ "$http_status" -ge 400 ] && [ "$http_status" -lt 500 ]; then
        echo -e "   ${YELLOW}⚠️  Status: $http_status${NC}"
    else
        echo -e "   ${RED}❌ Status: $http_status${NC}"
    fi
    
    # Pretty print JSON response
    if command -v jq &> /dev/null; then
        echo -e "   ${PURPLE}📄 Response:${NC}"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        echo -e "   ${PURPLE}📄 Response: $body${NC}"
    fi
    
    sleep $DELAY
}

# Check if server is running
check_server() {
    echo -e "${BLUE}🔍 Checking server availability...${NC}"
    if curl -s "$BASE_URL/health" > /dev/null; then
        echo -e "${GREEN}✅ Server is responding!${NC}"
        return 0
    else
        echo -e "${RED}❌ Server appears to be down. Please make sure the server is running on http://localhost:3001${NC}"
        echo -e "${YELLOW}   Run: npm start${NC}"
        return 1
    fi
}

# Test root endpoint
test_root_endpoint() {
    print_header "🏠 Testing Root Endpoint (/)"
    
    for i in {1..5}; do
        make_request "GET" "/" "" "Root request $i/5"
    done
}

# Test health endpoint
test_health_endpoint() {
    print_header "🏥 Testing Health Endpoint (/health)"
    
    for i in {1..5}; do
        make_request "GET" "/health" "" "Health check $i/5"
    done
}

# Test get user endpoint
test_get_user_endpoint() {
    print_header "👤 Testing Get User Endpoint (/api/users/:id)"
    
    user_ids=("1" "42" "123" "404" "999")
    
    for i in "${!user_ids[@]}"; do
        user_id="${user_ids[$i]}"
        make_request "GET" "/api/users/$user_id" "" "Get user $user_id ($((i+1))/${#user_ids[@]})"
    done
}

# Test create user endpoint
test_create_user_endpoint() {
    print_header "➕ Testing Create User Endpoint (POST /api/users)"
    
    # Valid users
    make_request "POST" "/api/users" '{"name":"Alice Johnson","email":"alice@example.com"}' "Create user Alice Johnson (1/5)"
    make_request "POST" "/api/users" '{"name":"Bob Smith","email":"bob@example.com"}' "Create user Bob Smith (2/5)"
    make_request "POST" "/api/users" '{"name":"Charlie Brown","email":"charlie@example.com"}' "Create user Charlie Brown (3/5)"
    
    # Invalid users (validation errors)
    make_request "POST" "/api/users" '{"name":"","email":"invalid@example.com"}' "Create user with missing name (4/5)"
    make_request "POST" "/api/users" '{"name":"Dave Wilson","email":""}' "Create user with missing email (5/5)"
}

# Test invalid endpoint
test_invalid_endpoint() {
    print_header "❓ Testing Invalid Endpoint (404 test)"
    
    make_request "GET" "/invalid/endpoint" "" "Testing 404 response"
}

# Main function
main() {
    echo -e "${CYAN}🎯 Starting comprehensive API testing...${NC}"
    echo -e "${BLUE}📡 Target server: $BASE_URL${NC}"
    echo -e "${BLUE}⏱️  Delay between requests: ${DELAY}s${NC}"
    
    # Check server availability
    if ! check_server; then
        exit 1
    fi
    
    echo -e "\n${GREEN}✅ Server is responding! Starting comprehensive tests...${NC}"
    
    # Run all tests
    test_root_endpoint
    test_health_endpoint
    test_get_user_endpoint
    test_create_user_endpoint
    test_invalid_endpoint
    
    print_header "🎉 All tests completed!"
    echo -e "${GREEN}📊 Check your OpenTelemetry dashboard for traces and metrics${NC}"
    echo -e "${GREEN}🔍 Look for traces with different spans and error conditions${NC}"
}

# Handle Ctrl+C gracefully
trap 'echo -e "\n\n${YELLOW}👋 Test script interrupted. Exiting gracefully...${NC}"; exit 0' INT

# Run main function
main "$@"
