const sendMessage = function (e) {
    if (add === "text") {
        const mes = {
            text: inputRef.current.value,
            key: v1(),
            user: "user",//!!!!!!!!!!!!! user needed
            room: room
        }

        createMessage([...message, mes]);
        socket.emit("new_massage", mes);
        inputRef.current.value = ""
    } else {
        const files = e
        //const uploadedFile = files[0];
        console.log(files);
        //socket.emit("adding_file", uploadedFile);
    }



}