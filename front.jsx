{
    viewed ? (
        <span style={{ marginLeft: 50 }}>
            {users.map((number) => (
                <span
                    key={number._id}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        selectMessage(number);
                    }}
                >
                    {number.user}

                </span>
            ))}
        </span>
    ) : (
        <span>васап</span>
    )
}